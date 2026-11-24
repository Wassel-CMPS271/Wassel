package com.wassel.backend.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The daily cap on authentication email (SCRUM-289, docs/contracts/auth-email.md): {@code dailyCap} sends in all,
 * {@code resetDailyCap} of them reset links, {@code perAccountDailyCap} for one account's own kind (sign-in codes and resends together, or reset links). Set by
 * {@code AUTH_EMAIL_DAILY_CAP}, {@code AUTH_EMAIL_RESET_DAILY_CAP} and {@code AUTH_EMAIL_PER_ACCOUNT_DAILY_CAP}. Together
 * with {@code NOTIFICATION_EMAIL_DAILY_CAP} the daily cap must stay under the provider's daily limit.
 */
@ConfigurationProperties(prefix = "wassel.auth.email")
public record AuthEmailProperties(@DefaultValue("120") int dailyCap, @DefaultValue("30") int resetDailyCap,
		@DefaultValue("10") int perAccountDailyCap) {

	public AuthEmailProperties {
		if (dailyCap < 1) {
			throw new IllegalArgumentException("wassel.auth.email.daily-cap (AUTH_EMAIL_DAILY_CAP) must be at least 1");
		}
		if (resetDailyCap < 1 || resetDailyCap > dailyCap) {
			throw new IllegalArgumentException(
					"wassel.auth.email.reset-daily-cap (AUTH_EMAIL_RESET_DAILY_CAP) must be between 1 and the daily cap");
		}
		if (perAccountDailyCap < 1) {
			throw new IllegalArgumentException(
					"wassel.auth.email.per-account-daily-cap (AUTH_EMAIL_PER_ACCOUNT_DAILY_CAP) must be at least 1");
		}
	}
}
