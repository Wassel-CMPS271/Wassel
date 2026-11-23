package com.wassel.backend.auth.config;

import com.wassel.backend.auth.service.RateLimiter;
import com.wassel.backend.auth.service.RateLimiter.Decision;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Slows down and refuses repeated POSTs from one address to the six public sign-in endpoints (SCRUM-288). It runs
 * before the body is read and before any account is looked up, so a refused request costs almost nothing. The
 * answer is a 429 problem detail with {@code Retry-After}, which the screens turn into "try again in N seconds".
 * (The one other 429, a code sent less than a minute ago, has no {@code Retry-After}: that is how the screens
 * tell them apart.) An account that sends wrong passwords is a different limit, the lockout (SCRUM-171); this
 * one is per address.
 */
@Slf4j
@Component
public class RateLimitFilter extends OncePerRequestFilter {

	private enum Endpoint {
		LOGIN, TWO_FACTOR_VERIFY, TWO_FACTOR_RESEND, LOGOUT, FORGOT_PASSWORD, SET_PASSWORD
	}

	private static final Map<String, Endpoint> ENDPOINTS = Map.of(
			"/api/auth/login", Endpoint.LOGIN,
			"/api/auth/2fa/verify", Endpoint.TWO_FACTOR_VERIFY,
			"/api/auth/2fa/resend", Endpoint.TWO_FACTOR_RESEND,
			"/api/auth/logout", Endpoint.LOGOUT,
			"/api/auth/forgot-password", Endpoint.FORGOT_PASSWORD,
			"/api/auth/password", Endpoint.SET_PASSWORD);

	private final RateLimitProperties properties;

	private final ClientAddressResolver addresses;

	private final RateLimiter limiter;

	public RateLimitFilter(RateLimitProperties properties, ClientAddressResolver addresses, RateLimiter limiter) {
		this.properties = properties;
		this.addresses = addresses;
		this.limiter = limiter;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !properties.enabled() || !"POST".equals(request.getMethod())
				|| !ENDPOINTS.containsKey(pathOf(request));
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		Endpoint endpoint = ENDPOINTS.get(pathOf(request));
		String address = addresses.resolve(request);
		Decision decision = limiter.tryAcquire(endpoint + ":" + address, limitOf(endpoint), properties.window());
		if (decision.allowed()) {
			filterChain.doFilter(request, response);
			return;
		}
		if (decision.firstRefusal()) {
			// Once per address and window, with the raw header next to the answer, so what the backend sees behind
			// a proxy can be read off the log (SCRUM-288, "which client address the backend sees").
			log.warn("Rate limit reached on {} by {} (connection {}, X-Forwarded-For {})", pathOf(request),
					address, request.getRemoteAddr(), ClientAddressResolver.forwardedChain(request));
		}
		refuse(response, decision.retryAfterSeconds());
	}

	/** The path as the application sees it: no context path, no {@code ;parameters}, decoded. */
	private static String pathOf(HttpServletRequest request) {
		return UrlPathHelper.defaultInstance.getPathWithinApplication(request);
	}

	private int limitOf(Endpoint endpoint) {
		RateLimitProperties.Limits limits = properties.limits();
		return switch (endpoint) {
			case LOGIN -> limits.login();
			case TWO_FACTOR_VERIFY -> limits.twoFactorVerify();
			case TWO_FACTOR_RESEND -> limits.twoFactorResend();
			case LOGOUT -> limits.logout();
			case FORGOT_PASSWORD -> limits.forgotPassword();
			case SET_PASSWORD -> limits.setPassword();
		};
	}

	private static void refuse(HttpServletResponse response, long retryAfterSeconds) throws IOException {
		response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
		response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Too Many Requests\",\"status\":429,"
				+ "\"detail\":\"Too many attempts. Try again in " + retryAfterSeconds + " seconds.\"}");
	}
}
