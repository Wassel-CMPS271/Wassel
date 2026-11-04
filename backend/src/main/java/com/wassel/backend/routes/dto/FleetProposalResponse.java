package com.wassel.backend.routes.dto;

import java.util.List;
import java.util.UUID;

/**
 * What generating all routes suggests for the school (routing contract, SCRUM-207). {@code id} is
 * null when {@code routes} is empty: there is nothing to apply and nothing is saved.
 */
public record FleetProposalResponse(
		UUID id,
		List<PlannedRouteResponse> routes,
		List<UnplacedStudentResponse> unplaced,
		List<ExcludedVehicleResponse> excludedVehicles,
		RouteSchoolResponse school) {
}
