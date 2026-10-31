package com.wassel.backend.routes.dto;

import java.time.LocalTime;
import java.util.UUID;

/**
 * A child's route, for the parent module (SCRUM-240): the route name, the driver with their phone
 * (for the "Call driver" button — not in {@link RouteDriverSummary}, which has no caller yet that
 * needs it) and the vehicle, plus this child's own expected pickup time from the same arrival-time
 * rule the route's own stops use ({@code RouteService#schedule}).
 */
public record ChildRouteInfo(
		UUID routeId,
		String routeName,
		Driver driver,
		RouteVehicleSummary vehicle,
		LocalTime expectedPickupTime) {

	public record Driver(UUID id, String firstName, String lastName, String phone) {
	}
}
