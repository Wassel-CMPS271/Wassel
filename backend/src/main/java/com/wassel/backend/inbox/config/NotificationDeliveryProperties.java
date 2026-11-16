package com.wassel.backend.inbox.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Email for inbox entries (SCRUM-283, docs/contracts/notification-delivery.md). Off unless
 * {@code NOTIFICATION_EMAIL_ENABLED=true}. {@code dailyCap} (default 150, {@code NOTIFICATION_EMAIL_DAILY_CAP}) is the most
 * emails sent in a day; the same mail account sends the sign-in codes, so keep it well under the provider's daily limit.
 */
@ConfigurationProperties(prefix = "wassel.notifications.email")
public record NotificationDeliveryProperties(boolean enabled, @DefaultValue("150") int dailyCap) {

	public NotificationDeliveryProperties {
		if (dailyCap < 1) {
			throw new IllegalArgumentException(
					"wassel.notifications.email.daily-cap (NOTIFICATION_EMAIL_DAILY_CAP) must be at least 1");
		}
	}
}
