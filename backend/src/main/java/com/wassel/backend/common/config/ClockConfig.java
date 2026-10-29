package com.wassel.backend.common.config;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * "Today" is the date in the school's zone, not the server's: a server running in UTC is still on
 * yesterday for the first two to three hours after midnight in Beirut. One school for now, so the zone
 * is a constant, not a setting.
 */
@Configuration
public class ClockConfig {

	public static final ZoneId SCHOOL_ZONE = ZoneId.of("Asia/Beirut");

	@Bean
	public Clock clock() {
		return Clock.system(SCHOOL_ZONE);
	}
}
