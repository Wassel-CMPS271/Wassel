package com.wassel.backend.drivers.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AssignVehicleRequest(
		@NotNull(message = "Vehicle id is required")
		UUID vehicleId) {
}
