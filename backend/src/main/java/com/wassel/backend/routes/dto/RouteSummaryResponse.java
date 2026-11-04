package com.wassel.backend.routes.dto;

import java.util.UUID;

/**
 * What the list endpoint returns. {@code seatsLeft} is {@code vehicle.capacity - studentCount}
 * and can go negative if the vehicle's capacity is lowered after students were assigned.
 */
public record RouteSummaryResponse(
		UUID id,
		String name,
		RouteVehicleSummary vehicle,
		RouteDriverSummary driver,
		int studentCount,
		int seatsLeft) {
}
