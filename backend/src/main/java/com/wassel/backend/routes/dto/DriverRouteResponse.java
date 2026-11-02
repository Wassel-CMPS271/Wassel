package com.wassel.backend.routes.dto;

import java.util.List;
import java.util.UUID;

/**
 * The route a driver is on, for the runs module: its stops with arrival time and guardian from one read of
 * the students, so order, times and phones cannot disagree with each other.
 */
public record DriverRouteResponse(
		UUID id,
		String name,
		RouteVehicleSummary vehicle,
		RouteDriverSummary driver,
		List<DriverRouteStop> stops) {
}
