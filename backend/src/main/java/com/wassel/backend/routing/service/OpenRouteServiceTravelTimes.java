package com.wassel.backend.routing.service;

import com.wassel.backend.routing.config.OpenRouteServiceProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Driving times from the OpenRouteService matrix endpoint (SCRUM-204), with
 * {@link StraightLineTravelTimes} as the fallback. {@code @Primary}, because two {@link TravelTimes}
 * beans stop startup.
 *
 * <p>Every ordered pair of points is cached (to a metre), so a route whose pairs are all known never
 * calls the provider. On any missing pair the whole point set is requested in one call, not just the
 * missing pairs: the free plan counts requests, and a new stop would need two calls, its row and its
 * column, to fetch only what is missing.
 *
 * <p>This never throws. No key, an unusable point set, or a provider that is failing gives
 * straight-line times for the whole matrix, never a mix of the two scales (a mix misleads the optimizer
 * and the arrival times), and the provider is then left alone for a while: a route response waits on this
 * call while it holds a database connection, so a dead provider must not cost every request a timeout,
 * and a refused quota must not be asked again on every page load. A pause after 429 (per-minute cap),
 * 5xx and timeouts is short; after 401/403 (the quota is used up, or the key is wrong; the two cannot be
 * told apart safely) it is long. Any other 4xx is about that point set (for example a pin more than
 * 350 m from a road), so only that set is left alone.
 */
@Slf4j
@Primary
@Component
public class OpenRouteServiceTravelTimes implements TravelTimes {

	/** The free plan allows 3,500 routes (sources x destinations) per request: 59 x 59 = 3,481. */
	static final int MAX_POINTS = 59;

	static final Duration SHORT_PAUSE = Duration.ofSeconds(60);

	static final Duration LONG_PAUSE = Duration.ofHours(1);

	/** Cache bound. ponytail: clears everything when full; an LRU if memory ever matters. */
	static final int MAX_CACHED_PAIRS = 100_000;

	private static final double SCALE = 100_000;

	/** A coordinate in 1e-5 degrees (about 1 m): the cache key, and what is sent to the provider. */
	private record Point(long lat, long lon) {

		static Point of(Coordinate c) {
			return new Point(Math.round(c.latitude() * SCALE), Math.round(c.longitude() * SCALE));
		}

		Coordinate coordinate() {
			return new Coordinate(lat / SCALE, lon / SCALE);
		}
	}

	private record Pair(Point from, Point to) {
	}

	/** Seconds, row = source, column = destination; a null cell is a pair with no route. */
	private record MatrixResponse(List<List<Double>> durations) {
	}

	private final RestClient restClient;

	private final StraightLineTravelTimes fallback;

	private final Clock clock;

	private final ConcurrentHashMap<Pair, Duration> cache = new ConcurrentHashMap<>();

	/** Point sets the provider rejected, until when to leave them alone. */
	private final ConcurrentHashMap<Set<Point>, Instant> rejectedSets = new ConcurrentHashMap<>();

	// ponytail: one lock serialises every provider call, which is fine for one school; per-set locks if not.
	private final Object lock = new Object();

	private volatile Instant pausedUntil = Instant.MIN;

	/** True from a pause until the next answer, so the recovery is logged once. */
	private volatile boolean paused;

	@Autowired
	public OpenRouteServiceTravelTimes(RestClient.Builder restClientBuilder, OpenRouteServiceProperties properties,
			StraightLineTravelTimes fallback) {
		this(restClientBuilder, properties, fallback, Clock.systemUTC());
	}

	OpenRouteServiceTravelTimes(RestClient.Builder restClientBuilder, OpenRouteServiceProperties properties,
			StraightLineTravelTimes fallback, Clock clock) {
		this.fallback = fallback;
		this.clock = clock;
		if (properties.apiKey() == null || properties.apiKey().isBlank()) {
			log.warn("ORS_API_KEY is not set: travel times are straight-line estimates, not road times");
			this.restClient = null;
			return;
		}
		restClientBuilder.baseUrl(properties.baseUrl()).defaultHeader("Authorization", properties.apiKey().trim());
		if (properties.timeout() != null) {
			restClientBuilder.requestFactory(withTimeouts(properties.timeout()));
		}
		this.restClient = restClientBuilder.build();
		log.info("OpenRouteService road travel times are on ({})", properties.baseUrl());
	}

	private static ClientHttpRequestFactory withTimeouts(Duration timeout) {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(timeout).build());
		factory.setReadTimeout(timeout);
		return factory;
	}

	@Override
	public Duration[][] matrix(List<Coordinate> points) {
		try {
			return roadTimes(points);
		} catch (RuntimeException e) {
			log.warn("Road travel times failed, using straight-line estimates: {}", e.getMessage(), e);
			return fallback.matrix(points);
		}
	}

	private Duration[][] roadTimes(List<Coordinate> points) {
		int n = points.size();
		if (n < 2) {
			return fallback.matrix(points);
		}
		List<Point> keys = points.stream().map(Point::of).toList();
		List<Point> unique = keys.stream().distinct().toList();
		if (!allCached(unique)) {
			synchronized (lock) {
				if (!allCached(unique)) {
					fetch(unique);
				}
			}
		}

		Duration[][] result = new Duration[n][n];
		for (int i = 0; i < n; i++) {
			for (int j = 0; j < n; j++) {
				if (keys.get(i).equals(keys.get(j))) {
					result[i][j] = Duration.ZERO;
					continue;
				}
				Duration known = cache.get(new Pair(keys.get(i), keys.get(j)));
				if (known == null) {
					// A pair is unknown (the provider is failing or off): estimate all of it.
					return fallback.matrix(points);
				}
				result[i][j] = known;
			}
		}
		return result;
	}

	private boolean allCached(List<Point> unique) {
		for (Point from : unique) {
			for (Point to : unique) {
				if (!from.equals(to) && !cache.containsKey(new Pair(from, to))) {
					return false;
				}
			}
		}
		return true;
	}

	/** Asks the provider for the whole set and caches every pair. On any failure caches nothing. */
	private void fetch(List<Point> unique) {
		Instant now = clock.instant();
		if (restClient == null || now.isBefore(pausedUntil)) {
			return;
		}
		Set<Point> set = Set.copyOf(unique);
		Instant rejectedUntil = rejectedSets.get(set);
		if (rejectedUntil != null && now.isBefore(rejectedUntil)) {
			return;
		}
		if (unique.size() > MAX_POINTS) {
			reject(set, now, unique.size() + " distinct points exceed the request limit of " + MAX_POINTS);
			return;
		}

		try {
			double[][] locations = new double[unique.size()][];
			for (int i = 0; i < locations.length; i++) {
				Coordinate c = unique.get(i).coordinate();
				locations[i] = new double[] { c.longitude(), c.latitude() };
			}
			MatrixResponse response = restClient.post()
					.uri("/v2/matrix/driving-car")
					.contentType(MediaType.APPLICATION_JSON)
					.body(Map.of("locations", locations, "metrics", List.of("duration")))
					.retrieve()
					.body(MatrixResponse.class);
			store(unique, response);
		} catch (RestClientResponseException e) {
			int status = e.getStatusCode().value();
			String what = "answered " + status + ": " + e.getMessage();
			if (status == 401 || status == 403) {
				pause(now, LONG_PAUSE, what);
			} else if (status == 429 || status >= 500) {
				pause(now, SHORT_PAUSE, what);
			} else {
				reject(set, now, what);
			}
		} catch (RuntimeException e) {
			if (Thread.currentThread().isInterrupted()) {
				// Cancelled from our side, not a sign the provider is down: leave it available.
				log.warn("OpenRouteService request was interrupted; using straight-line estimates");
			} else {
				// A timeout, a connection error or a body that does not fit.
				pause(now, SHORT_PAUSE, "failed: " + e.getMessage());
			}
		}
	}

	private void pause(Instant now, Duration length, String what) {
		pausedUntil = now.plus(length);
		paused = true;
		log.warn("OpenRouteService {}; using straight-line estimates and not asking again for {}", what, length);
	}

	private void reject(Set<Point> set, Instant now, String what) {
		if (rejectedSets.size() > 1_000) {
			rejectedSets.clear();
		}
		rejectedSets.put(set, now.plus(LONG_PAUSE));
		log.warn("OpenRouteService {}; using straight-line estimates for these points and not asking about them again for {}",
				what, LONG_PAUSE);
	}

	private void store(List<Point> unique, MatrixResponse response) {
		int n = unique.size();
		List<List<Double>> seconds = response == null ? null : response.durations();
		if (seconds == null || seconds.size() != n) {
			throw new IllegalStateException("unexpected matrix shape");
		}
		for (List<Double> row : seconds) {
			if (row == null || row.size() != n) {
				throw new IllegalStateException("unexpected matrix shape");
			}
			for (Double cell : row) {
				if (cell != null && cell < 0) {
					throw new IllegalStateException("unexpected duration " + cell);
				}
			}
		}

		if (cache.size() + n * n > MAX_CACHED_PAIRS) {
			cache.clear();
		}
		Duration[][] straightLine = null;
		int withoutRoute = 0;
		for (int i = 0; i < n; i++) {
			for (int j = 0; j < n; j++) {
				if (i == j) {
					continue;
				}
				Double cell = seconds.get(i).get(j);
				if (cell == null) {
					// No route between the two, which will not change: remember the estimate.
					if (straightLine == null) {
						straightLine = fallback.matrix(unique.stream().map(Point::coordinate).toList());
					}
					withoutRoute++;
					cache.put(new Pair(unique.get(i), unique.get(j)), straightLine[i][j]);
				} else {
					cache.put(new Pair(unique.get(i), unique.get(j)), Duration.ofMinutes((long) Math.ceil(cell / 60)));
				}
			}
		}
		if (withoutRoute > 0) {
			log.warn("OpenRouteService found no road between {} of {} pairs; those use straight-line estimates",
					withoutRoute, n * (n - 1));
		}
		if (paused) {
			paused = false;
			log.info("OpenRouteService is answering again");
		}
	}
}
