package com.wassel.backend.vehicles.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

/**
 * The plate number must match the Lebanese private plate format: 1-3 letters, a space, then
 * 1-6 digits (e.g. {@code "A 123456"}).
 */
public record CreateVehicleRequest(
		@NotBlank(message = "Plate number is required")
		@Pattern(regexp = "^[A-Za-z]{1,3} \\d{1,6}$",
				message = "Use a format like \"A 123456\" (1-3 letters, space, 1-6 digits)")
		String plateNumber,

		@NotNull(message = "Capacity is required")
		@Positive(message = "Capacity must be a positive number")
		Integer capacity) {

	// Trims before the @Pattern check runs, so surrounding whitespace doesn't fail validation.
	public CreateVehicleRequest {
		plateNumber = plateNumber == null ? null : plateNumber.trim();
	}
}
