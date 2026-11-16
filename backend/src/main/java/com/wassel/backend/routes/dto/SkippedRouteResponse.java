package com.wassel.backend.routes.dto;

import java.util.UUID;

/** A route that is no option for the student, and why. */
public record SkippedRouteResponse(UUID routeId, String routeName, RouteSkipReason reason) {
}
