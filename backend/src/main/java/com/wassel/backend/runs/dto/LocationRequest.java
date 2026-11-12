package com.wassel.backend.runs.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/** The body of {@code PUT .../location}. The time is never sent: it is the server's. */
public record LocationRequest(
		@NotNull(message = "Latitude is required")
		@DecimalMin(value = "-90", message = "Latitude must be between -90 and 90")
		@DecimalMax(value = "90", message = "Latitude must be between -90 and 90")
		Double latitude,

		@NotNull(message = "Longitude is required")
		@DecimalMin(value = "-180", message = "Longitude must be between -180 and 180")
		@DecimalMax(value = "180", message = "Longitude must be between -180 and 180")
		Double longitude,

		@NotNull(message = "Accuracy is required")
		@DecimalMin(value = "0", message = "Accuracy must be between 0 and 10000 metres")
		@DecimalMax(value = "10000", message = "Accuracy must be between 0 and 10000 metres")
		Double accuracyMeters) {
}
