package com.wassel.backend.schools.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

/**
 * The school's location (SCRUM-208/routing contract). A configuration value, not an admin
 * setting, because the MVP serves one school: every route response includes it, so the app
 * refuses to start without it, the same way {@code JwtProperties} does for the JWT secret.
 */
@ConfigurationProperties(prefix = "wassel.school")
public record SchoolLocationProperties(BigDecimal latitude, BigDecimal longitude) {

	public SchoolLocationProperties {
		if (latitude == null || longitude == null) {
			throw new IllegalArgumentException(
					"wassel.school.latitude and wassel.school.longitude (SCHOOL_LATITUDE / SCHOOL_LONGITUDE) must be set");
		}
	}
}
