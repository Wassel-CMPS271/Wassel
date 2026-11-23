package com.wassel.backend.monitoring.config;

import com.wassel.backend.common.MutableClock;
import com.wassel.backend.monitoring.dto.MetricsResponse;
import com.wassel.backend.monitoring.service.OperationalMetrics;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** SCRUM-290: which requests are counted, how they are classified, and that a crash counts as a 500. */
class RequestMetricsFilterTests {

	private OperationalMetrics metrics;

	private RequestMetricsFilter filter;

	@BeforeEach
	void setUp() {
		metrics = new OperationalMetrics(new MutableClock(Instant.parse("2026-11-23T08:00:00Z"), ZoneOffset.UTC));
		filter = new RequestMetricsFilter(metrics);
	}

	private void call(String method, String path, int status) throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest(method, path);
		FilterChain chain = (req, res) -> ((jakarta.servlet.http.HttpServletResponse) res).setStatus(status);
		filter.doFilter(request, new MockHttpServletResponse(), chain);
	}

	@Test
	void countsEveryAnswerAndClassifiesServerErrorsAndTooManyRequests() throws Exception {
		call("GET", "/api/routes", 200);
		call("GET", "/api/routes", 404);
		call("POST", "/api/students", 500);
		call("POST", "/api/auth/login", 429);
		call("GET", "/api/routes", 503);

		MetricsResponse snapshot = metrics.snapshot();
		assertEquals(5, snapshot.requests().total());
		assertEquals(2, snapshot.requests().serverErrors());
		assertEquals(1, snapshot.requests().tooManyRequests());
		assertEquals(5, snapshot.requests().latencySample());
	}

	@Test
	void aRequestThatEndsInAnExceptionCountsAs500AndTheExceptionStillPropagates() {
		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/routes");
		FilterChain chain = (req, res) -> {
			throw new ServletException("boom");
		};

		assertThrows(ServletException.class, () -> filter.doFilter(request, new MockHttpServletResponse(), chain));

		assertEquals(1, metrics.snapshot().requests().serverErrors());
		assertEquals(1, metrics.snapshot().requests().total());
	}

	@Test
	void theHealthCheckAndTheMetricsEndpointAreNotCounted() throws Exception {
		call("GET", "/actuator/health", 200);
		call("GET", "/actuator/health", 503);
		call("GET", "/api/admin/metrics", 200);
		call("GET", "/api/admin/metrics;jsessionid=1", 200);

		assertEquals(0, metrics.snapshot().requests().total());
		assertEquals(0, metrics.snapshot().requests().serverErrors());
	}

	@Test
	void aWrongPasswordIsAFailedSignInAndSoIsAWrongCodeButNothingElse() throws Exception {
		call("POST", "/api/auth/login", 401);
		call("POST", "/api/auth/login", 401);
		call("POST", "/api/auth/2fa/verify", 400);
		// Not failed sign-ins: a success, a malformed body, a refused address, a vanished pending login, a read.
		call("POST", "/api/auth/login", 204);
		call("POST", "/api/auth/login", 400);
		call("POST", "/api/auth/login", 429);
		call("POST", "/api/auth/2fa/verify", 401);
		call("POST", "/api/auth/2fa/verify", 200);
		call("POST", "/api/auth/logout", 401);
		call("GET", "/api/auth/login", 401);
		call("GET", "/api/auth/me", 401);

		assertEquals(3, metrics.snapshot().signIns().failed());
	}
}
