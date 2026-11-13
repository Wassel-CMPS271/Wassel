package com.wassel.backend.inbox.config;

import com.wassel.backend.inbox.service.LateAlertService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Makes the late alerts (SCRUM-268) once a minute, a minute after the last call finished. Not in tests, so a background
 * run cannot make an entry in the middle of one; they call {@link LateAlertService#raise} themselves. A call that
 * fails is logged by the scheduler and the next one runs as usual, which is also the retry: the service makes nothing
 * twice.
 */
@Slf4j
@Configuration
@EnableScheduling
@Profile("!test")
@RequiredArgsConstructor
class LateAlertJob {

	private final LateAlertService lateAlertService;

	@Scheduled(fixedDelayString = "PT1M")
	void raise() {
		int made = lateAlertService.raise();
		if (made > 0) {
			log.info("Made {} late alerts", made);
		}
	}
}
