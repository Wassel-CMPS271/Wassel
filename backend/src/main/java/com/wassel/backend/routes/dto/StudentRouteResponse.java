package com.wassel.backend.routes.dto;

import java.util.UUID;

/**
 * A student's route and their display position on it, for a module (e.g. {@code absences}) that
 * needs to show "which route, which stop" without depending on {@code routes} any further than
 * this one lookup. {@code position} is this student's 1-based rank among the route's stops in
 * display order (see {@code RouteService#findStudentRoute}), not the raw, watermarked
 * {@code stopPosition} column {@code students.entity.Student} stores.
 */
public record StudentRouteResponse(UUID routeId, String routeName, int position) {
}
