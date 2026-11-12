package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.sun.net.httpserver.HttpServer;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-262: polling the live estimate never spends the road provider's small daily quota. The real road client talks to
 * a local stand-in that counts every matrix request (no real provider, no key), so the planned schedule really goes
 * through it once, and then the test shows that a moving bus and repeated polls add no request at all.
 */
class LiveEtaRoadProviderTests extends RunCriteriaSupport {

	private static final AtomicInteger REQUESTS = new AtomicInteger();

	private static final HttpServer PROVIDER = provider();

	/** Answers every matrix request with one minute between any two different points, and counts it. */
	private static HttpServer provider() {
		try {
			HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
			server.createContext("/v2/matrix/driving-car", exchange -> {
				REQUESTS.incrementAndGet();
				int n = JsonPath.read(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8),
						"$.locations.length()");
				StringBuilder rows = new StringBuilder();
				for (int i = 0; i < n; i++) {
					rows.append(i == 0 ? "[" : ",[");
					for (int j = 0; j < n; j++) {
						rows.append(j == 0 ? "" : ",").append(i == j ? "0" : "60");
					}
					rows.append(']');
				}
				byte[] body = ("{\"durations\":[" + rows + "]}").getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, body.length);
				try (OutputStream out = exchange.getResponseBody()) {
					out.write(body);
				}
			});
			server.start();
			return server;
		} catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	@DynamicPropertySource
	static void roadProvider(DynamicPropertyRegistry registry) {
		registry.add("routing.openrouteservice.api-key", () -> "a-stand-in-key");
		registry.add("routing.openrouteservice.base-url", () -> "http://127.0.0.1:" + PROVIDER.getAddress().getPort());
	}

	@Test
	void pollingAMovingBusAsksTheRoadProviderNothing() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID child = aStudent("Dana", parent);
		onRoute(bus, aStudent("Rami", null), child);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		assertEquals(200, send(put("/api/driver/runs/" + run + "/location-sharing").with(as(Role.DRIVER, bus.driverUserId()))
				.contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}")).getStatus());
		// The first read of each kind may fill the route's schedule from the provider: that is the planned time.
		poll(bus, run, parent, child, 0);
		int afterWarmUp = REQUESTS.get();
		assertTrue(afterWarmUp >= 1, "the stand-in is really the road client's provider (the schedule used it)");

		for (int i = 1; i <= 20; i++) {
			poll(bus, run, parent, child, i);
		}

		assertEquals(afterWarmUp, REQUESTS.get(), "20 polls of a bus at 20 new places asked the provider nothing");
	}

	/** The driver sends a new place, then the parent and the head each read once, and both get an estimate. */
	private void poll(Bus bus, String run, UUID parent, UUID child, int step) throws Exception {
		assertEquals(204, send(put("/api/driver/runs/" + run + "/location").with(as(Role.DRIVER, bus.driverUserId()))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"latitude\":%s,\"longitude\":35.48,\"accuracyMeters\":5}".formatted(33.85 + step * 0.001)))
				.getStatus());
		MockHttpServletResponse parentSees = send(get("/api/parent/children/" + child + "/bus-location")
				.with(as(Role.PARENT, parent)));
		assertEquals(200, parentSees.getStatus());
		assertNotNull(JsonPath.read(parentSees.getContentAsString(), "$.estimate"));
		MockHttpServletResponse headSees = send(get(HEAD_RUNS + "/locations").with(head()));
		assertEquals(200, headSees.getStatus());
		assertNotNull(JsonPath.read(headSees.getContentAsString(), "$[0].nextStop.estimate"));
	}
}
