package com.wassel.backend.routes.dto;

import java.util.List;
import java.util.UUID;

/** Everything in {@link RouteSummaryResponse}, plus the school and the stops in order. */
public record RouteResponse(
		UUID id,
		String name,
		RouteVehicleSummary vehicle,
		RouteDriverSummary driver,
		int studentCount,
		int seatsLeft,
		RouteSchoolResponse school,
		List<StopResponse> stops) {
}
