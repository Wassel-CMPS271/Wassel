package com.wassel.backend.routes.dto;

/** An active vehicle that was not planned because no active driver can drive it, and why. */
public record ExcludedVehicleResponse(RouteVehicleSummary vehicle, String message) {
}
