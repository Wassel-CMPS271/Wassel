package com.wassel.backend.monitoring.config;

import com.wassel.backend.monitoring.service.OperationalMetrics;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

import java.io.IOException;

/**
 * Times and counts every request for {@link OperationalMetrics} (SCRUM-290). It is the outermost filter, so it also
 * sees what the security filters answer (a 401, a 429 from the sign-in limit) and a request that ended in an
 * exception, which counts as a 500. The health check is not counted (an uptime monitor calls it all day and would
 * drag the latency down), and neither is the metrics endpoint, so reading the numbers does not change them.
 * <p>
 * It also counts failed sign-ins from what login answers: a 401 (wrong or unknown password, disabled or locked
 * account, all one answer by design). Wrong 2FA codes are counted by {@code TwoFactorService} itself, because the
 * answer is a 400 for most and a 401 for the fifth, and a malformed body is also a 400.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RequestMetricsFilter extends OncePerRequestFilter {

	static final String METRICS_PATH = "/api/admin/metrics";

	private final OperationalMetrics metrics;

	public RequestMetricsFilter(OperationalMetrics metrics) {
		this.metrics = metrics;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		String path = pathOf(request);
		return path.startsWith("/actuator") || METRICS_PATH.equals(path);
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		long started = System.nanoTime();
		int status = 500;
		try {
			filterChain.doFilter(request, response);
			status = response.getStatus();
		}
		finally {
			metrics.request(status, System.nanoTime() - started);
			if (isFailedSignIn(request, status)) {
				metrics.signInFailed();
			}
		}
	}

	/** The path as the application sees it: no context path, no {@code ;parameters}, decoded. */
	private static String pathOf(HttpServletRequest request) {
		return UrlPathHelper.defaultInstance.getPathWithinApplication(request);
	}

	private static boolean isFailedSignIn(HttpServletRequest request, int status) {
		if (!"POST".equals(request.getMethod())) {
			return false;
		}
		return "/api/auth/login".equals(pathOf(request)) && status == 401;
	}
}
