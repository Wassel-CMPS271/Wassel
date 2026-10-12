package com.wassel.backend.auth.config;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertThrows;

class JwtPropertiesTests {

	private static final String GOOD_SECRET = "0123456789abcdef0123456789abcdef";

	@Test
	void aMissingSecretIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new JwtProperties(null, Duration.ofHours(1), true));
	}

	@Test
	void aSecretShorterThan32BytesIsRejected() {
		assertThrows(IllegalArgumentException.class,
				() -> new JwtProperties("0123456789abcdef0123456789abcde", Duration.ofHours(1), true));
	}

	@Test
	void aMissingZeroOrNegativeLifetimeIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new JwtProperties(GOOD_SECRET, null, true));
		assertThrows(IllegalArgumentException.class, () -> new JwtProperties(GOOD_SECRET, Duration.ZERO, true));
		assertThrows(IllegalArgumentException.class,
				() -> new JwtProperties(GOOD_SECRET, Duration.ofMinutes(-1), true));
	}
}
