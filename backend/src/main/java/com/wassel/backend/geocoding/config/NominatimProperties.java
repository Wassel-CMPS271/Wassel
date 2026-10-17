package com.wassel.backend.geocoding.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Neither value is a secret and both have safe defaults, so unlike {@code JwtProperties} or
 * {@code SchoolLocationProperties} there's nothing to fail startup over.
 */
@ConfigurationProperties(prefix = "geocoding.nominatim")
public record NominatimProperties(String baseUrl, String userAgent) {
}
