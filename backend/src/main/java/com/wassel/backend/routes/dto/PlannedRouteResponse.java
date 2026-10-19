package com.wassel.backend.routes.dto;

import java.util.List;
import java.util.UUID;

/**
 * One route of a {@link FleetProposalResponse}. {@code existingRouteId} is the route it updates,
 * null when applying creates it; {@code leaving} are the students on that route today who will not
 * be on it afterwards.
 */
public record PlannedRouteResponse(
		UUID existingRouteId,
		String name,
		RouteVehicleSummary vehicle,
		RouteDriverSummary driver,
		long drivingMinutes,
		List<StopResponse> stops,
		List<LeavingStudentResponse> leaving) {
}
