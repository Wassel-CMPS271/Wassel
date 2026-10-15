package com.wassel.backend.routes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** Shared by create and edit: the contract uses the same body for both. */
public record RouteRequest(
		@NotBlank(message = "Name is required")
		String name,

		@NotNull(message = "Vehicle id is required")
		UUID vehicleId,

		@NotNull(message = "Driver id is required")
		UUID driverId) {

	public RouteRequest {
		name = name == null ? null : name.trim();
	}
}
