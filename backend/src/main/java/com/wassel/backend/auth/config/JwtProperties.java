package com.wassel.backend.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** The app refuses to start with a missing or short secret, or a non-positive lifetime. */
@ConfigurationProperties(prefix = "jwt")
public record JwtProperties(String secret, Duration expiration, boolean cookieSecure) {

	private static final int MIN_SECRET_BYTES = 32;

	public JwtProperties {
		if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
			throw new IllegalArgumentException(
					"jwt.secret (JWT_SECRET) must be set to at least %d bytes".formatted(MIN_SECRET_BYTES));
		}
		if (expiration == null || expiration.isZero() || expiration.isNegative()) {
			throw new IllegalArgumentException("jwt.expiration (JWT_EXPIRATION) must be a positive duration");
		}
	}
}
