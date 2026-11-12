package com.wassel.backend.runs.config;

import com.wassel.backend.runs.entity.RunLocation;
import com.wassel.backend.runs.repository.RunLocationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

/**
 * Retention (SCRUM-261): a position older than {@link RunLocation#SHOWN_FOR} is never shown, so it is not kept either.
 * Runs that are never ended (a driver who left) would otherwise keep their last position for ever. Not in tests, so a
 * background run cannot empty a position in the middle of one; they run its statement,
 * {@code RunLocationRepository.clearReceivedBefore}, themselves.
 */
@Slf4j
@Configuration
@EnableScheduling
@Profile("!test")
@RequiredArgsConstructor
class LocationPurge {

	private final RunLocationRepository runLocationRepository;

	private final Clock clock;

	@Scheduled(fixedDelayString = "PT1M")
	@Transactional
	void purge() {
		int cleared = runLocationRepository.clearReceivedBefore(Instant.now(clock).minus(RunLocation.SHOWN_FOR));
		if (cleared > 0) {
			log.info("Cleared {} stored positions older than {}", cleared, RunLocation.SHOWN_FOR);
		}
	}
}
