package com.wassel.backend.students.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/** Corrects the student's pickup pin on the map. */
public record UpdateStudentLocationRequest(
		@NotNull(message = "Latitude is required")
		@DecimalMin(value = "-90", message = "Latitude must be between -90 and 90")
		@DecimalMax(value = "90", message = "Latitude must be between -90 and 90")
		BigDecimal latitude,

		@NotNull(message = "Longitude is required")
		@DecimalMin(value = "-180", message = "Longitude must be between -180 and 180")
		@DecimalMax(value = "180", message = "Longitude must be between -180 and 180")
		BigDecimal longitude) {
}
