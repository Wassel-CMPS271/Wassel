package com.wassel.backend.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Account lockout (SCRUM-171): {@code maxFailures} wrong passwords in a row lock the account for {@code duration}.
 * Set by {@code LOCKOUT_MAX_FAILURES} and {@code LOCKOUT_DURATION} (5 and 15 minutes by default).
 */
@ConfigurationProperties(prefix = "wassel.auth.lockout")
public record LockoutProperties(int maxFailures, Duration duration) {

	public LockoutProperties {
		if (maxFailures < 1) {
			throw new IllegalArgumentException("wassel.auth.lockout.max-failures (LOCKOUT_MAX_FAILURES) must be at least 1");
		}
		if (duration == null || duration.isZero() || duration.isNegative()) {
			throw new IllegalArgumentException("wassel.auth.lockout.duration (LOCKOUT_DURATION) must be a positive duration");
		}
	}
}
