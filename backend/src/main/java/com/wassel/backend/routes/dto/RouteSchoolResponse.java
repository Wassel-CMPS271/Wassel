package com.wassel.backend.routes.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.LocalTime;

/**
 * Where every route ends, and the arrival time it works back from. {@code arrivalTime} is
 * null until an admin sets the school's arrival time (schools module).
 */
public record RouteSchoolResponse(
		BigDecimal latitude,
		BigDecimal longitude,
		@JsonFormat(pattern = "HH:mm") LocalTime arrivalTime) {
}
