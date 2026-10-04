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

	private final JwtProperties jwtProperties;

	public ResponseCookie create(String token) {
		return base(token).maxAge(jwtProperties.expiration()).build();
	}

	public ResponseCookie clear() {
		return base("").maxAge(Duration.ZERO).build();
	}

	public Optional<String> read(HttpServletRequest request) {
		return Optional.ofNullable(WebUtils.getCookie(request, NAME)).map(Cookie::getValue);
	}

	private ResponseCookie.ResponseCookieBuilder base(String value) {
		return ResponseCookie.from(NAME, value)
				.httpOnly(true)
				.secure(jwtProperties.cookieSecure())
				.sameSite("Strict")
				.path("/");
	}
}
