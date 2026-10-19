package com.wassel.backend.routing.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Settings for the OpenRouteService road-time client (SCRUM-204). A blank {@code apiKey} is not an
 * error: the client then never calls the provider and every matrix is straight-line, which is what
 * local runs and CI do. Staging refuses to start without the key (docker-compose.staging.yml).
 *
 * <p>{@code timeout} is the connect and read timeout. A route response waits on the provider while
 * it holds a database connection, so it is short.
 */
@ConfigurationProperties(prefix = "routing.openrouteservice")
public record OpenRouteServiceProperties(String baseUrl, String apiKey, Duration timeout) {

	/** The generated {@code toString} would print the key. */
	@Override
	public String toString() {
		return "OpenRouteServiceProperties[baseUrl=" + baseUrl + ", timeout=" + timeout + "]";
	}
}
