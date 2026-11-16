package com.wassel.backend.inbox.config;

import com.wassel.backend.inbox.service.NotificationDeliveryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Sends the emails for inbox entries (SCRUM-283) 30 seconds after the last run finished. It exists only when
 * {@code NOTIFICATION_EMAIL_ENABLED=true}, and never in tests, which call {@link NotificationDeliveryService#deliverDue}
 * themselves. A run that fails is logged by the service (the class of the error only) and the next one carries on.
 */
@Slf4j
@Configuration
@EnableScheduling
@Profile("!test")
@ConditionalOnProperty(name = "wassel.notifications.email.enabled", havingValue = "true")
@RequiredArgsConstructor
class NotificationDeliveryJob {

	private final NotificationDeliveryService deliveryService;

	@Scheduled(fixedDelayString = "PT30S")
	void deliver() {
		int sent = deliveryService.deliverDue();
		if (sent > 0) {
			log.info("Sent {} notification emails", sent);
		}
	}
}
