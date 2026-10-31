package com.wassel.backend.routes.config;

import com.wassel.backend.routes.service.RouteService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Fills the road-time cache for every route once the server is up (SCRUM-233 review), so the first
 * 7 am requests after a restart don't each wait on OpenRouteService. It runs on its own thread so
 * startup does not wait for it, and not in tests, where it would read the shared database while tests
 * rewrite it.
 */
@Component
@Profile("!test")
@RequiredArgsConstructor
class TravelTimeWarmer {

	private final RouteService routeService;

	@EventListener(ApplicationReadyEvent.class)
	void warm() {
		Thread thread = new Thread(routeService::warmTravelTimes, "travel-time-warmer");
		thread.setDaemon(true);
		thread.start();
	}
}
