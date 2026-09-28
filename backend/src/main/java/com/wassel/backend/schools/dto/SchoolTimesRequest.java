package com.wassel.backend.schools.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotNull;

import java.time.LocalTime;

/**
 * Both times are required and sent as 24-hour {@code HH:mm} (e.g. {@code "07:30"}).
 * The rule that dismissal is after arrival is checked in the service.
 */
public record SchoolTimesRequest(
		@NotNull(message = "Arrival time is required")
		@JsonFormat(pattern = "HH:mm")
		LocalTime arrivalTime,

		@NotNull(message = "Dismissal time is required")
		@JsonFormat(pattern = "HH:mm")
		LocalTime dismissalTime) {
}
