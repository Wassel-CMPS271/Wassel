package com.wassel.backend.routing.service;

import com.wassel.backend.routing.config.OpenRouteServiceProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * What the HTTP tests can't show: that the app, built from its real configuration, hands the road client
 * to everything that asks for a {@link TravelTimes}, binds the settings, and that the {@code test}
 * profile blanks the key (so an {@code ORS_API_KEY} exported in a developer's shell can't make the other
 * Spring tests call the real provider or change their straight-line numbers).
 */
@SpringBootTest
@ActiveProfiles("test")
class OpenRouteServiceWiringTests {

	@Autowired
	private TravelTimes travelTimes;

	@Autowired
	private OpenRouteServiceProperties properties;

	@Test
	void theRoadClientIsTheTravelTimesCallersGet() {
		assertInstanceOf(OpenRouteServiceTravelTimes.class, travelTimes);
	}

	@Test
	void theSettingsBindAndTheTestProfileHasNoKey() {
		assertEquals("https://api.openrouteservice.org", properties.baseUrl());
		assertEquals(Duration.ofSeconds(3), properties.timeout());
		assertTrue(properties.apiKey() == null || properties.apiKey().isBlank(),
				"the test profile must blank the key");
	}
}
