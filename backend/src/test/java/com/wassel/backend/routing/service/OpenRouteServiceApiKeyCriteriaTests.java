package com.wassel.backend.routing.service;

import com.wassel.backend.routing.config.OpenRouteServiceProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * SCRUM-215: the key comes from configuration (ultimately {@code ORS_API_KEY}), not a hard-coded value.
 * {@link OpenRouteServiceWiringTests} (SCRUM-204's own suite) shows the {@code test} profile blanks the
 * key; this checks the other direction, independently: when the environment does supply one, it is the
 * exact value the client ends up with.
 */
@SpringBootTest(properties = "routing.openrouteservice.api-key=env-provided-secret")
@ActiveProfiles("test")
class OpenRouteServiceApiKeyCriteriaTests {

	@Autowired
	private OpenRouteServiceProperties properties;

	@Test
	void aKeySuppliedByTheEnvironmentReachesTheBoundProperties() {
		assertEquals("env-provided-secret", properties.apiKey());
	}
}
