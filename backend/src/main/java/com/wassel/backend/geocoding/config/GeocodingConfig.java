package com.wassel.backend.geocoding.config;

import org.springframework.beans.factory.config.ConfigurableBeanFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Scope;
import org.springframework.web.client.RestClient;

/**
 * {@code spring-boot-starter-webmvc} alone doesn't bring in {@code RestClientAutoConfiguration},
 * so there's no {@code RestClient.Builder} bean anywhere in the app unless something defines
 * one. Prototype-scoped, the same as Spring Boot's own auto-configured builder would be, so each
 * injection point gets its own builder to customize independently.
 */
@Configuration
public class GeocodingConfig {

	@Bean
	@Scope(ConfigurableBeanFactory.SCOPE_PROTOTYPE)
	public RestClient.Builder restClientBuilder() {
		return RestClient.builder();
	}
}
