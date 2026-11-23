package com.wassel.backend.auth.config;

import com.wassel.backend.auth.service.RateLimiter;
import com.wassel.backend.auth.controller.AuthController;
import com.wassel.backend.common.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-288: the six public endpoints are limited per address, every other path is left alone, and the answer is
 * a 429 the screens can read. Plain servlet objects, no Spring context.
 */
class RateLimitFilterTests {

	private static final List<String> SIX = List.of("/api/auth/login", "/api/auth/2fa/verify", "/api/auth/2fa/resend",
			"/api/auth/logout", "/api/auth/forgot-password", "/api/auth/password");

	private MutableClock clock;

	private RateLimitFilter filter;

	@BeforeEach
	void setUp() {
		clock = new MutableClock(Instant.parse("2026-11-23T08:00:00Z"), ZoneOffset.UTC);
		filter = filter(true, 0, new RateLimitProperties.Limits(3, 3, 3, 3, 3, 3));
	}

	private RateLimitFilter filter(boolean enabled, int hops, RateLimitProperties.Limits limits) {
		RateLimitProperties properties = new RateLimitProperties(enabled, Duration.ofMinutes(1), hops, limits);
		return new RateLimitFilter(properties, new ClientAddressResolver(properties), new RateLimiter(clock));
	}

	private static MockHttpServletRequest post(String path, String remote) {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
		request.setServletPath(path);
		request.setRemoteAddr(remote);
		return request;
	}

	/** Runs one request through the filter; the chain's request is set when the request got past the limit. */
	private MockHttpServletResponse send(MockHttpServletRequest request) throws Exception {
		MockHttpServletResponse response = new MockHttpServletResponse();
		filter.doFilter(request, response, new MockFilterChain());
		return response;
	}

	@Test
	void everyOneOfTheSixEndpointsIsLimitedAndAnswersAProblemWithRetryAfter() throws Exception {
		for (String path : SIX) {
			for (int i = 0; i < 3; i++) {
				assertEquals(200, send(post(path, "203.0.113.9")).getStatus(), path);
			}
			MockHttpServletResponse refused = send(post(path, "203.0.113.9"));
			assertEquals(429, refused.getStatus(), path);
			assertEquals("60", refused.getHeader("Retry-After"), path);
			assertTrue(refused.getContentType().startsWith("application/problem+json"), path);
			assertTrue(refused.getContentAsString().contains("\"status\":429"), path);
			assertTrue(refused.getContentAsString().contains("Try again in 60 seconds."), path);
		}
	}

	@Test
	void aRefusedRequestNeverReachesTheController() throws Exception {
		for (int i = 0; i < 3; i++) {
			send(post("/api/auth/login", "203.0.113.9"));
		}
		MockHttpServletResponse response = new MockHttpServletResponse();
		MockFilterChain chain = new MockFilterChain();
		filter.doFilter(post("/api/auth/login", "203.0.113.9"), response, chain);
		assertEquals(429, response.getStatus());
		assertNull(chain.getRequest());
	}

	@Test
	void anotherAddressIsNotAffected() throws Exception {
		for (int i = 0; i < 4; i++) {
			send(post("/api/auth/login", "203.0.113.9"));
		}
		assertEquals(429, send(post("/api/auth/login", "203.0.113.9")).getStatus());
		assertEquals(200, send(post("/api/auth/login", "203.0.113.10")).getStatus());
	}

	@Test
	void eachEndpointHasItsOwnCount() throws Exception {
		for (int i = 0; i < 4; i++) {
			send(post("/api/auth/login", "203.0.113.9"));
		}
		assertEquals(429, send(post("/api/auth/login", "203.0.113.9")).getStatus());
		assertEquals(200, send(post("/api/auth/forgot-password", "203.0.113.9")).getStatus());
	}

	@Test
	void eachEndpointUsesItsOwnConfiguredLimit() throws Exception {
		filter = filter(true, 0, new RateLimitProperties.Limits(1, 2, 3, 4, 5, 6));
		int[] expected = {1, 2, 3, 4, 5, 6};
		for (int i = 0; i < SIX.size(); i++) {
			int allowed = 0;
			while (send(post(SIX.get(i), "203.0.113.9")).getStatus() == 200) {
				allowed++;
			}
			assertEquals(expected[i], allowed, SIX.get(i));
		}
	}

	@Test
	void theWindowEndingLetsTheAddressBackIn() throws Exception {
		for (int i = 0; i < 4; i++) {
			send(post("/api/auth/login", "203.0.113.9"));
		}
		clock.set(clock.instant().plusSeconds(61));
		assertEquals(200, send(post("/api/auth/login", "203.0.113.9")).getStatus());
	}

	@Test
	void otherPathsAndMethodsAreNeverCounted() throws Exception {
		for (int i = 0; i < 20; i++) {
			assertEquals(200, send(post("/api/auth/me", "203.0.113.9")).getStatus());
			assertEquals(200, send(post("/api/auth/login/", "203.0.113.9")).getStatus());
			MockHttpServletRequest get = post("/api/auth/login", "203.0.113.9");
			get.setMethod("GET");
			assertEquals(200, send(get).getStatus());
			MockHttpServletRequest preflight = post("/api/auth/login", "203.0.113.9");
			preflight.setMethod("OPTIONS");
			assertEquals(200, send(preflight).getStatus());
		}
		// None of that used up the real allowance.
		assertEquals(200, send(post("/api/auth/login", "203.0.113.9")).getStatus());
	}

	@Test
	void disabledMeansNothingIsLimited() throws Exception {
		filter = filter(false, 0, new RateLimitProperties.Limits(1, 1, 1, 1, 1, 1));
		for (int i = 0; i < 10; i++) {
			assertEquals(200, send(post("/api/auth/login", "203.0.113.9")).getStatus());
		}
	}

	@Test
	void aForgedForwardedHeaderDoesNotMoveARequestToAFreshBucket() throws Exception {
		// No trusted proxy: the header is ignored, so rotating it buys the attacker nothing.
		for (int i = 0; i < 3; i++) {
			MockHttpServletRequest request = post("/api/auth/login", "203.0.113.9");
			request.addHeader("X-Forwarded-For", "198.51.100." + i);
			assertEquals(200, send(request).getStatus());
		}
		MockHttpServletRequest forged = post("/api/auth/login", "203.0.113.9");
		forged.addHeader("X-Forwarded-For", "198.51.100.77");
		assertEquals(429, send(forged).getStatus());
	}

	@Test
	void behindATrustedProxyEachClientHasItsOwnBucketAndForgedEntriesAreIgnored() throws Exception {
		filter = filter(true, 1, new RateLimitProperties.Limits(3, 3, 3, 3, 3, 3));
		// The proxy at 10.0.0.1 appends the address it saw; whatever the client put before it is ignored.
		for (int i = 0; i < 3; i++) {
			MockHttpServletRequest request = post("/api/auth/login", "10.0.0.1");
			request.addHeader("X-Forwarded-For", "9.9.9." + i + ", 198.51.100.7");
			assertEquals(200, send(request).getStatus());
		}
		MockHttpServletRequest sameClient = post("/api/auth/login", "10.0.0.1");
		sameClient.addHeader("X-Forwarded-For", "9.9.9.200, 198.51.100.7");
		assertEquals(429, send(sameClient).getStatus());

		// One address must not lock out the whole school: another client behind the same proxy still gets in.
		MockHttpServletRequest otherClient = post("/api/auth/login", "10.0.0.1");
		otherClient.addHeader("X-Forwarded-For", "198.51.100.8");
		assertEquals(200, send(otherClient).getStatus());
	}

	@Test
	void theResponseDoesNotEchoTheAddress() throws Exception {
		for (int i = 0; i < 3; i++) {
			send(post("/api/auth/login", "203.0.113.9"));
		}
		String body = send(post("/api/auth/login", "203.0.113.9")).getContentAsString();
		assertFalse(body.contains("203.0.113.9"));
	}

	@Test
	void theSixPathsAreTheOnesTheControllerPosts() {
		// If a public POST endpoint is added or removed, this fails until the filter's list follows.
		long posts = java.util.Arrays.stream(AuthController.class.getDeclaredMethods())
				.filter(m -> m.isAnnotationPresent(org.springframework.web.bind.annotation.PostMapping.class))
				.count();
		assertEquals(SIX.size(), posts);
	}
}
