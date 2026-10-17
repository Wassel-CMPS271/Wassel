package com.wassel.backend.demo.service;

import com.wassel.backend.schools.dto.SchoolTimesRequest;
import com.wassel.backend.schools.service.SchoolSettingsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

// Its own email base, because demo accounts are unique across the platform and DemoDataServiceTests
// has already created the default ones.
@SpringBootTest(properties = "wassel.demo.email-base=keeps-times@wassel.local")
@ActiveProfiles("test")
class DemoDataKeepsSchoolTimesTests {

	@Autowired
	private DemoDataService demoDataService;

	@Autowired
	private SchoolSettingsService schoolSettingsService;

	@Test
	void keepsSchoolTimesThatAreAlreadySet() {
		UUID school = UUID.randomUUID();
		schoolSettingsService.updateTimes(school, new SchoolTimesRequest(LocalTime.of(7, 15), LocalTime.of(13, 0)));

		demoDataService.seed(school, "a-long-enough-demo-password");

		assertEquals(LocalTime.of(7, 15), schoolSettingsService.getTimes(school).arrivalTime());
		assertEquals(LocalTime.of(13, 0), schoolSettingsService.getTimes(school).dismissalTime());
	}
}
