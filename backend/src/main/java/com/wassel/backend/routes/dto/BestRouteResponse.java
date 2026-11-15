package com.wassel.backend.routes.dto;

import java.util.List;
import java.util.UUID;

/**
 * The routes a student could go on, best first (SCRUM-270). {@code recommended} is the first option, or null when no
 * route can take them; every route of the school is either an option or skipped, with the reason.
 */
public record BestRouteResponse(UUID studentId, RouteOptionResponse recommended, List<RouteOptionResponse> options,
		List<SkippedRouteResponse> skipped) {
}
