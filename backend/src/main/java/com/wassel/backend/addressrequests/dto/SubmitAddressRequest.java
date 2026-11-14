package com.wassel.backend.addressrequests.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * The body of the parent's request. The pin is optional, but both coordinates or neither (the service checks that,
 * since a missing one is not a validation error on its own).
 */
public record SubmitAddressRequest(
		@NotBlank(message = "Address is required")
		@Size(max = 255, message = "Address must be 255 characters or fewer")
		String address,

		@DecimalMin(value = "-90", message = "Latitude must be between -90 and 90")
		@DecimalMax(value = "90", message = "Latitude must be between -90 and 90")
		BigDecimal latitude,

		@DecimalMin(value = "-180", message = "Longitude must be between -180 and 180")
		@DecimalMax(value = "180", message = "Longitude must be between -180 and 180")
		BigDecimal longitude) {

	public SubmitAddressRequest {
		address = address == null ? null : address.trim();
	}
}
