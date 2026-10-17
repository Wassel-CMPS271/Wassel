package com.wassel.backend.geocoding.service;

import com.sun.net.httpserver.HttpServer;
import com.wassel.backend.geocoding.config.NominatimProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntConsumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Runs {@link NominatimGeocoder} against a real HTTP server on localhost, for what the mock server in
 * {@link NominatimGeocoderTests} can't show: timeouts, and what actually goes over the wire.
 */
class NominatimGeocoderHttpTests {

	private static final String FOUND = "[{\"lat\":\"33.8938\",\"lon\":\"35.5018\"}]";

	private HttpServer server;

	// The raw query string of every request the server received, in order.
	private final List<String> queries = new CopyOnWriteArrayList<>();

	private final AtomicInteger requests = new AtomicInteger();

	// Runs before the server answers the n-th request (1-based), e.g. to sleep.
	private IntConsumer beforeResponding = n -> {
	};

	// When true the first request gets a 503 and every later one is answered normally.
	private boolean failFirst;

	private int statusFor(int n) {
		return n == 1 && failFirst ? 503 : 200;
	}

	private String body = FOUND;

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/search", exchange -> {
			int n = requests.incrementAndGet();
			queries.add(exchange.getRequestURI().getRawQuery());
			beforeResponding.accept(n);
			byte[] bytes = (statusFor(n) == 200 ? body : "overloaded").getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(statusFor(n), bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		// The default executor is single-threaded, so a request left sleeping would block the next one.
		server.setExecutor(Executors.newCachedThreadPool());
		server.start();
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	private Geocoder geocoder(String countryCodes, Duration timeout) {
		String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
		return new NominatimGeocoder(RestClient.builder(),
				new NominatimProperties(baseUrl, "wassel-test-agent/1.0", countryCodes, timeout));
	}

	private static String decodedQ(String rawQuery) {
		for (String pair : rawQuery.split("&")) {
			if (pair.startsWith("q=")) {
				return URLDecoder.decode(pair.substring(2), StandardCharsets.UTF_8);
			}
		}
		throw new AssertionError("no q parameter in " + rawQuery);
	}

	@Test
	void aFailedLookupIsRetriedTheNextTime() {
		failFirst = true;
		Geocoder geocoder = geocoder(null, Duration.ofSeconds(5));

		assertTrue(geocoder.geocode("Hamra Street").isEmpty(), "the 503 reads as not found");
		Optional<GeocodeResult> retried = geocoder.geocode("Hamra Street");

		assertTrue(retried.isPresent(), "a temporary outage must not stay cached as 'not found'");
		assertEquals(2, requests.get());
	}

	@Test
	void aGenuineNotFoundIsStillCached() {
		body = "[]";
		Geocoder geocoder = geocoder(null, Duration.ofSeconds(5));

		assertTrue(geocoder.geocode("Nowhere").isEmpty());
		assertTrue(geocoder.geocode("Nowhere").isEmpty());

		assertEquals(1, requests.get());
	}

	@Test
	void resultsAreRestrictedToTheConfiguredCountries() {
		geocoder("lb", Duration.ofSeconds(5)).geocode("Verdun Street");
		geocoder("  ", Duration.ofSeconds(5)).geocode("Main Street");

		assertTrue(queries.get(0).contains("countrycodes=lb"), queries.get(0));
		assertFalse(queries.get(1).contains("countrycodes"), "a blank setting sends no restriction: " + queries.get(1));
	}

	@Test
	void aSlowProviderTimesOutInsteadOfHoldingTheSaveOpen() {
		beforeResponding = n -> {
			if (n == 1) {
				try {
					Thread.sleep(3000);
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
			}
		};
		Geocoder geocoder = geocoder(null, Duration.ofMillis(300));

		Instant start = Instant.now();
		Optional<GeocodeResult> result = geocoder.geocode("Hamra Street");
		Duration elapsed = Duration.between(start, Instant.now());

		assertTrue(result.isEmpty());
		assertTrue(elapsed.toMillis() < 2000, "gave up after " + elapsed.toMillis() + " ms");
		assertTrue(geocoder.geocode("Hamra Street").isPresent(), "and the timeout is not cached either");
	}

	@Test
	void specialCharactersInAnAddressArriveIntact() {
		List<String> addresses = new ArrayList<>(List.of(
				"شارع الحمرا, بيروت",
				"Street {1}, Beirut",
				"100% Main & Co #5 + 2",
				"Rue d'Hamra, \"Ras Beirut\""));
		Geocoder geocoder = geocoder(null, Duration.ofSeconds(5));

		for (String address : addresses) {
			assertTrue(geocoder.geocode(address).isPresent(), "lookup of: " + address);
		}

		assertEquals(addresses, queries.stream().map(NominatimGeocoderHttpTests::decodedQ).toList());
	}
}
