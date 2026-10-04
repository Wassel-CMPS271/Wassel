package com.wassel.backend.auth.config;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.util.WebUtils;

import java.time.Duration;
import java.util.Optional;

/**
 * SameSite=Strict is what stands in for CSRF protection on this cookie, so the frontend and the
 * API must be served from the same site (same host, any port).
 */
@Component
@RequiredArgsConstructor
public class AuthCookie {

	public static final String NAME = "wassel_token";

	/** Holds the pending-login token between the password step and the code step. It is not a session. */
	public static final String PENDING_NAME = "wassel_2fa";

	// How long the user has to enter the code; keep in step with TwoFactorService's pending lifetime.
	private static final Duration PENDING_MAX_AGE = Duration.ofMinutes(15);

	private final JwtProperties jwtProperties;

	public ResponseCookie create(String token) {
		return base(NAME, token).maxAge(jwtProperties.expiration()).build();
	}

	public ResponseCookie clear() {
		return base(NAME, "").maxAge(Duration.ZERO).build();
	}

	public Optional<String> read(HttpServletRequest request) {
		return Optional.ofNullable(WebUtils.getCookie(request, NAME)).map(Cookie::getValue);
	}

	public ResponseCookie createPending(String pendingToken) {
		return base(PENDING_NAME, pendingToken).maxAge(PENDING_MAX_AGE).build();
	}

	public ResponseCookie clearPending() {
		return base(PENDING_NAME, "").maxAge(Duration.ZERO).build();
	}

	public Optional<String> readPending(HttpServletRequest request) {
		return Optional.ofNullable(WebUtils.getCookie(request, PENDING_NAME)).map(Cookie::getValue);
	}

	private ResponseCookie.ResponseCookieBuilder base(String name, String value) {
		return ResponseCookie.from(name, value)
				.httpOnly(true)
				.secure(jwtProperties.cookieSecure())
				.sameSite("Strict")
				.path("/");
	}
}
