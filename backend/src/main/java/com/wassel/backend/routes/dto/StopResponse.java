package com.wassel.backend.routes.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.UUID;

/**
 * One student on one route. A stop is a student: {@code studentId} is its only identity, there
 * is no separate stop id (routing contract). Not produced yet: no route has stops until
 * SCRUM-209 (assign) exists.
 */
public record StopResponse(
		UUID studentId,
		int position,
		String firstName,
		String lastName,
		String address,
		BigDecimal latitude,
		BigDecimal longitude,
		@JsonFormat(pattern = "HH:mm") LocalTime arrivalTime) {
}
