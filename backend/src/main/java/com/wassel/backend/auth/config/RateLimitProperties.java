package com.wassel.backend.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Per-address limit on the public sign-in endpoints (SCRUM-288): at most {@code limits.*} requests from one
 * address to one endpoint in each {@code window}, then 429 with {@code Retry-After} until the window ends.
 * <p>
 * {@code trustedProxyHops} is how many proxies sit in front of the backend and each add the address they
 * received the request from to the end of {@code X-Forwarded-For}. 0 (the default) ignores the header and uses
 * the connection's own address, which is the only safe choice when nobody in front is known. See
 * {@link ClientAddressResolver}.
 * <p>
 * The counters are in memory: they reset on a restart and are not shared, so this assumes one backend instance.
 */
@ConfigurationProperties(prefix = "wassel.auth.rate-limit")
public record RateLimitProperties(boolean enabled, Duration window, int trustedProxyHops, Limits limits) {

	/** Requests per window, per address, for each endpoint. */
	public record Limits(int login, int twoFactorVerify, int twoFactorResend, int logout, int forgotPassword,
			int setPassword) {

		public Limits {
			requirePositive("login", login);
			requirePositive("two-factor-verify", twoFactorVerify);
			requirePositive("two-factor-resend", twoFactorResend);
			requirePositive("logout", logout);
			requirePositive("forgot-password", forgotPassword);
			requirePositive("set-password", setPassword);
		}

		private static void requirePositive(String name, int value) {
			if (value < 1) {
				throw new IllegalArgumentException("wassel.auth.rate-limit.limits." + name + " must be at least 1");
			}
		}
	}

	public RateLimitProperties {
		if (window == null || window.compareTo(Duration.ofSeconds(1)) < 0) {
			throw new IllegalArgumentException(
					"wassel.auth.rate-limit.window (RATE_LIMIT_WINDOW) must be at least one second");
		}
		if (trustedProxyHops < 0 || trustedProxyHops > 10) {
			throw new IllegalArgumentException(
					"wassel.auth.rate-limit.trusted-proxy-hops (RATE_LIMIT_TRUSTED_PROXY_HOPS) must be between 0 and 10");
		}
		if (limits == null) {
			throw new IllegalArgumentException("wassel.auth.rate-limit.limits is required");
		}
	}
}
