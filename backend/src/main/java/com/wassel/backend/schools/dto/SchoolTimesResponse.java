package com.wassel.backend.schools.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalTime;

/**
 * A school's arrival and dismissal times as {@code HH:mm}. Both are null until an admin
 * has set them.
 */
public record SchoolTimesResponse(
		@JsonFormat(pattern = "HH:mm") LocalTime arrivalTime,
		@JsonFormat(pattern = "HH:mm") LocalTime dismissalTime) {
}
