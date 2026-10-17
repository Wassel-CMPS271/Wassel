package com.wassel.backend.geocoding.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * None of these is a secret and all have safe defaults, so unlike {@code JwtProperties} or
 * {@code SchoolLocationProperties} there's nothing to fail startup over.
 *
 * <p>{@code countryCodes} restricts results to those countries (comma-separated ISO 3166-1 codes,
 * e.g. {@code lb}); blank sends no restriction. Without it a street name alone resolves to its best
 * match worldwide, so a pin could land on another continent. {@code timeout} is the connect and read
 * timeout, so a slow Nominatim can't hold an address save (and its database connection) open; null
 * means the HTTP client's own default, which is no timeout.
 */
@ConfigurationProperties(prefix = "geocoding.nominatim")
public record NominatimProperties(String baseUrl, String userAgent, String countryCodes, Duration timeout) {
}
