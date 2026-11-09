package com.wassel.backend.common;

import com.wassel.backend.common.config.ClockConfig;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Instant;

/**
 * Pins "today" to Monday 2026-11-02 (10:00 in Beirut) for the SCRUM-236 criteria suites, so no test depends on the
 * weekday CI happens to run on (Saturday and Sunday are holidays, which would empty every run). Tests move it with
 * {@link MutableClock#set}; {@link CriteriaTestSupport} puts it back before each test.
 */
@TestConfiguration
public class MondayClockConfig {

	public static final Instant MONDAY = Instant.parse("2026-11-02T08:00:00Z");

	@Bean
	@Primary
	MutableClock testClock() {
		return new MutableClock(MONDAY, ClockConfig.SCHOOL_ZONE);
	}
}
