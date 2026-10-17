package com.wassel.backend.geocoding.service;

import com.wassel.backend.geocoding.config.NominatimProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Geocodes with the public Nominatim instance (OpenStreetMap). Throttled to at most one request
 * per second, as its usage policy requires, and every answer (including "not found") is cached by
 * the address text, so the same address is never requested twice. A lookup that fails (an error,
 * or no answer within the timeout) is not cached, so a short outage doesn't make an address
 * permanently "not found".
 */
@Slf4j
@Component
public class NominatimGeocoder implements Geocoder {

	private static final Duration MIN_INTERVAL = Duration.ofSeconds(1);

	private final RestClient restClient;

	private final String countryCodes;

	private final ConcurrentHashMap<String, Optional<GeocodeResult>> cache = new ConcurrentHashMap<>();

	private final Object throttleLock = new Object();

	private Instant lastRequestAt = Instant.EPOCH;

	public NominatimGeocoder(RestClient.Builder restClientBuilder, NominatimProperties properties) {
		restClientBuilder.baseUrl(properties.baseUrl()).defaultHeader("User-Agent", properties.userAgent());
		if (properties.timeout() != null) {
			restClientBuilder.requestFactory(withTimeouts(properties.timeout()));
		}
		this.restClient = restClientBuilder.build();
		this.countryCodes = properties.countryCodes();
	}

	private static ClientHttpRequestFactory withTimeouts(Duration timeout) {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(timeout).build());
		factory.setReadTimeout(timeout);
		return factory;
	}

	@Override
	public Optional<GeocodeResult> geocode(String address) {
		// lookup() returns null for a failure, and computeIfAbsent stores nothing for null.
		Optional<GeocodeResult> answer = cache.computeIfAbsent(address.trim(), this::lookup);
		return answer == null ? Optional.empty() : answer;
	}

	/**
	 * Runs inside {@code computeIfAbsent}, so two calls for the same address never both reach
	 * Nominatim. Returns the answer (empty = nothing found), or null when the lookup failed.
	 */
	private Optional<GeocodeResult> lookup(String address) {
		throttle();
		try {
			List<NominatimResult> results = restClient.get()
					.uri(uriBuilder -> {
						uriBuilder.path("/search").queryParam("q", "{q}").queryParam("format", "json").queryParam("limit", 1);
						if (countryCodes != null && !countryCodes.isBlank()) {
							uriBuilder.queryParam("countrycodes", countryCodes.trim());
						}
						return uriBuilder.build(Map.of("q", address));
					})
					.retrieve()
					.body(new ParameterizedTypeReference<List<NominatimResult>>() {
					});
			if (results == null || results.isEmpty()) {
				return Optional.empty();
			}
			NominatimResult first = results.get(0);
			return Optional.of(new GeocodeResult(new BigDecimal(first.lat()), new BigDecimal(first.lon())));
		} catch (RestClientException | NumberFormatException e) {
			log.warn("Geocoding failed for an address: {}", e.getMessage());
			return null;
		}
	}

	/** Blocks the calling thread until at least {@link #MIN_INTERVAL} has passed since the last request. */
	private void throttle() {
		synchronized (throttleLock) {
			Duration sinceLast = Duration.between(lastRequestAt, Instant.now());
			if (sinceLast.compareTo(MIN_INTERVAL) < 0) {
				try {
					Thread.sleep(MIN_INTERVAL.minus(sinceLast).toMillis());
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
			}
			lastRequestAt = Instant.now();
		}
	}

	/** Nominatim returns coordinates as JSON strings, not numbers. Extra fields are ignored. */
	private record NominatimResult(String lat, String lon) {
	}
}
