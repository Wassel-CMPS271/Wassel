package com.wassel.backend.routes.dto;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.UUID;

/** A {@link StopResponse} with the guardian to call, for the driver's run. */
public record DriverRouteStop(
		UUID studentId,
		int position,
		String firstName,
		String lastName,
		String address,
		BigDecimal latitude,
		BigDecimal longitude,
		LocalTime arrivalTime,
		String guardianName,
		String guardianPhone) {
}
