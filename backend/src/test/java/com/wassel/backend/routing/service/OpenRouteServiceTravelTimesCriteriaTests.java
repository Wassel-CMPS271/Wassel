package com.wassel.backend.routing.service;

import com.sun.net.httpserver.HttpServer;
import com.wassel.backend.routing.config.OpenRouteServiceProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * SCRUM-215: the road travel-time client's acceptance criteria, written from the ticket and the
 * {@link TravelTimes} contract, not from {@link OpenRouteServiceTravelTimesHttpTests} (SCRUM-204's own
 * suite). Covers only what SCRUM-215 asks for: a result is cached and never requested twice, the
 * fallback to straight-line times when the provider fails or the quota is used up, and that the key
 * comes from configuration (environment) rather than being hard-coded. A small local HTTP server stands
 * in for OpenRouteService so requests can be counted and inspected for real.
 */
class OpenRouteServiceTravelTimesCriteriaTests {

	private static final Coordinate A = new Coordinate(33.8938, 35.5018);

	private static final Coordinate B = new Coordinate(33.8886, 35.5189);

	private static final Coordinate C = new Coordinate(33.896, 35.484);

	private HttpServer server;

	private final AtomicInteger requests = new AtomicInteger();

	private volatile String lastAuthorizationHeader;

	private volatile String lastQuery;

	private volatile int status = 200;

	private volatile String body = "{\"durations\":[[0,120],[130,0]]}";

	@BeforeEach
	void startProvider() throws IOException {
		server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
		server.createContext("/v2/matrix/driving-car", exchange -> {
			requests.incrementAndGet();
			lastAuthorizationHeader = exchange.getRequestHeaders().getFirst("Authorization");
			lastQuery = exchange.getRequestURI().getRawQuery();
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

	private OpenRouteServiceTravelTimes client(String apiKey) {
		String baseUrl = "http://localhost:" + server.getAddress().getPort();
		return new OpenRouteServiceTravelTimes(RestClient.builder(),
				new OpenRouteServiceProperties(baseUrl, apiKey, Duration.ofSeconds(5)), new StraightLineTravelTimes());
	}

	@Test
	void aKnownPairIsNeverRequestedTwice() {
		TravelTimes client = client("test-key");
		List<Coordinate> points = List.of(A, B);

		Duration[][] first = client.matrix(points);
		Duration[][] second = client.matrix(points);

		assertEquals(1, requests.get());
		assertEquals(Duration.ofMinutes(2), first[0][1]);
		assertEquals(Duration.ofMinutes(3), first[1][0]);
		assertEquals(first[0][1], second[0][1]);
		assertEquals(first[1][0], second[1][0]);
	}

	@Test
	void addingANewPointCostsOneMoreRequestButDoesNotRepeatTheKnownPair() {
		TravelTimes client = client("test-key");
		client.matrix(List.of(A, B));
		assertEquals(1, requests.get());

		body = "{\"durations\":[[0,120,200],[130,0,210],[220,230,0]]}";
		Duration[][] withThird = client.matrix(List.of(A, B, C));

		assertEquals(2, requests.get());
		assertEquals(Duration.ofMinutes(2), withThird[0][1]);
		assertEquals(Duration.ofMinutes(3), withThird[1][0]);
	}

	@Test
	void aProviderErrorFallsBackToStraightLineTimes() {
		status = 500;
		body = "{\"error\":\"overloaded\"}";
		TravelTimes client = client("test-key");
		List<Coordinate> points = List.of(A, B);

		Duration[][] result = client.matrix(points);

		assertEquals(1, requests.get());
		assertEquals(new StraightLineTravelTimes().matrix(points)[0][1], result[0][1]);
		assertEquals(new StraightLineTravelTimes().matrix(points)[1][0], result[1][0]);
	}

	@Test
	void aRefusedQuotaFallsBackAndTheProviderIsLeftAlone() {
		status = 403;
		body = "{\"error\":{\"message\":\"quota exceeded\"}}";
		TravelTimes client = client("test-key");
		List<Coordinate> points = List.of(A, B);

		Duration[][] first = client.matrix(points);
		Duration[][] second = client.matrix(points);

		assertEquals(1, requests.get(), "a refused quota must not be asked again right away");
		assertEquals(new StraightLineTravelTimes().matrix(points)[0][1], first[0][1]);
		assertEquals(first[0][1], second[0][1]);
	}

	@Test
	void aBlankKeyNeverCallsTheProviderAndAlwaysFallsBack() {
		TravelTimes client = client("");
		List<Coordinate> points = List.of(A, B);

		Duration[][] result = client.matrix(points);

		assertEquals(0, requests.get(), "no key means the provider is never called");
		assertEquals(new StraightLineTravelTimes().matrix(points)[0][1], result[0][1]);
	}

	@Test
	void aMissingKeyNeverCallsTheProviderEither() {
		TravelTimes client = client(null);
		List<Coordinate> points = List.of(A, B);

		Duration[][] result = client.matrix(points);

		assertEquals(0, requests.get());
		assertEquals(new StraightLineTravelTimes().matrix(points)[0][1], result[0][1]);
	}

	@Test
	void theConfiguredKeyIsSentAsTheAuthorizationHeaderNotAQueryParameter() {
		TravelTimes client = client("configured-secret-key");

		client.matrix(List.of(A, B));

		assertEquals(1, requests.get());
		assertEquals("configured-secret-key", lastAuthorizationHeader);
		assertFalse(lastQuery != null && lastQuery.contains("configured-secret-key"),
				"the key must never appear in the URL");
	}

	@Test
	void aSingleOrEmptyPointListNeverCallsTheProvider() {
		TravelTimes client = client("test-key");

		client.matrix(List.of(A));
		client.matrix(List.of());

		assertEquals(0, requests.get());
	}

}
