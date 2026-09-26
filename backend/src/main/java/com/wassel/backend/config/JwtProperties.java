package com.wassel.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * JWT settings bound from the {@code jwt.*} properties in application.yml.
 */
@ConfigurationProperties(prefix = "jwt")
public record JwtProperties(String secret, Duration expiration) {
}
