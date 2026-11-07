package com.wassel.backend.geocoding.service;

import com.sun.net.httpserver.HttpServer;
import com.wassel.backend.geocoding.config.NominatimProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-226: the geocoding criteria, written from the ticket and not from the implementation, against
 * a small local HTTP server standing in for the provider so request counts and the time between
 * requests can be observed for real. The service is only used through {@link Geocoder}.
 */
class GeocodingCriteriaTests {

	private static final String HAMRA_ANSWER = "[{\"lat\":\"33.8938\",\"lon\":\"35.5018\"}]";

	// A little under one second, to allow for the clock rather than for the service being fast.
	private static final long MIN_GAP_MILLIS = 950;

	private HttpServer server;

	private final AtomicInteger requests = new AtomicInteger();

	private final List<Long> arrivalsNanos = Collections.synchronizedList(new ArrayList<>());

	private final List<String> queries = Collections.synchronizedList(new ArrayList<>());

	// What the stand-in provider answers: a status and a body, set per test.
	private volatile int status = 200;

	private volatile String body = HAMRA_ANSWER;

	@BeforeEach
	void startProvider() throws IOException {
		server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
		server.createContext("/search", exchange -> {
			arrivalsNanos.add(System.nanoTime());
			requests.incrementAndGet();
			queries.add(queryParameter(exchange.getRequestURI().getRawQuery(), "q"));
			byte[] response = body.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(status, response.length);
			exchange.getResponseBody().write(response);
			exchange.close();
		});
		server.start();
	}

	@AfterEach
	void stopProvider() {
		server.stop(0);
	}

	private Geocoder geocoder() {
		String baseUrl = "http://localhost:" + server.getAddress().getPort();
		return new NominatimGeocoder(RestClient.builder(),
				new NominatimProperties(baseUrl, "wassel-criteria-tests/1.0", null, Duration.ofSeconds(5)));
	}

	private static String queryParameter(String rawQuery, String name) {
		for (String pair : rawQuery.split("&")) {
			String[] parts = pair.split("=", 2);
			if (parts[0].equals(name)) {
				return URLDecoder.decode(parts.length > 1 ? parts[1] : "", StandardCharsets.UTF_8);
			}
		}
		return null;
	}

	private void assertEverySecondRequestWasAtLeastOneSecondAfterThePrevious() {
		List<Long> sorted = new ArrayList<>(arrivalsNanos);
		Collections.sort(sorted);
		for (int i = 1; i < sorted.size(); i++) {
			long gapMillis = TimeUnit.NANOSECONDS.toMillis(sorted.get(i) - sorted.get(i - 1));
			assertTrue(gapMillis >= MIN_GAP_MILLIS,
					"request " + (i + 1) + " came " + gapMillis + " ms after the one before it");
		}
	}

	@Test
	void anAddressIsGeocodedToTheProvidersCoordinates() {
		Optional<GeocodeResult> result = geocoder().geocode("Hamra Street, Beirut");

		assertEquals(Optional.of(new GeocodeResult(new BigDecimal("33.8938"), new BigDecimal("35.5018"))), result);
		assertEquals(1, requests.get());
		assertEquals("Hamra Street, Beirut", queries.get(0));
	}

	@Test
	void theSameAddressIsNeverRequestedTwice() {
		Geocoder geocoder = geocoder();

		Optional<GeocodeResult> first = geocoder.geocode("Hamra Street, Beirut");
		Optional<GeocodeResult> second = geocoder.geocode("Hamra Street, Beirut");
		Optional<GeocodeResult> paddedCopy = geocoder.geocode("  Hamra Street, Beirut  ");

		assertEquals(1, requests.get());
		assertEquals(first, second);
		assertEquals(first, paddedCopy);
	}

	@Test
	void anAddressThatWasNotFoundIsNotRequestedAgainEither() {
		body = "[]";
		Geocoder geocoder = geocoder();

		assertTrue(geocoder.geocode("Nowhere in particular").isEmpty());
		assertTrue(geocoder.geocode("Nowhere in particular").isEmpty());

		assertEquals(1, requests.get());
	}

	@Test
	void differentAddressesAreEachRequested() {
		Geocoder geocoder = geocoder();

		geocoder.geocode("Hamra Street, Beirut");
		geocoder.geocode("Sodeco Square, Beirut");

		assertEquals(List.of("Hamra Street, Beirut", "Sodeco Square, Beirut"), queries);
	}

	@Test
	void aFailedLookupGivesNoPinAndIsTriedAgainNextTime() {
		Geocoder geocoder = geocoder();

		status = 500;
		body = "{\"error\":\"overloaded\"}";
		assertTrue(geocoder.geocode("Hamra Street, Beirut").isEmpty());

		status = 200;
		body = HAMRA_ANSWER;
		assertTrue(geocoder.geocode("Hamra Street, Beirut").isPresent());
		assertEquals(2, requests.get());
	}

	@Test
	void requestsForDifferentAddressesAreAtLeastOneSecondApart() {
		Geocoder geocoder = geocoder();

		geocoder.geocode("Address one, Beirut");
		geocoder.geocode("Address two, Beirut");
		geocoder.geocode("Address three, Beirut");

		assertEquals(3, requests.get());
		assertEverySecondRequestWasAtLeastOneSecondAfterThePrevious();
	}

	@Test
	void requestsMadeAtTheSameTimeAreStillSpacedOutOneSecondApart() throws Exception {
		Geocoder geocoder = geocoder();
		int callers = 3;
		ExecutorService pool = Executors.newFixedThreadPool(callers);
		CountDownLatch go = new CountDownLatch(1);
		try {
			List<Future<?>> futures = new ArrayList<>();
			for (int i = 1; i <= callers; i++) {
				String address = "Concurrent address " + i + ", Beirut";
				futures.add(pool.submit(() -> {
					go.await();
					return geocoder.geocode(address);
				}));
			}
			go.countDown();
			for (Future<?> future : futures) {
				future.get(20, TimeUnit.SECONDS);
			}
		}
		finally {
			pool.shutdownNow();
		}

		assertEquals(callers, requests.get());
		assertEverySecondRequestWasAtLeastOneSecondAfterThePrevious();
	}
}
