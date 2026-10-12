package com.wassel.backend.vehicles.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record SetVehicleCapacityRequest(
		@NotNull(message = "Capacity is required")
		@Positive(message = "Capacity must be a positive number")
		Integer capacity) {
}
