package com.wassel.backend.schools.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * The date is sent as an ISO calendar date (e.g. {@code "2026-12-25"}); impossible dates such
 * as {@code "2026-02-30"} are rejected as an unreadable body.
 */
public record CreateHolidayRequest(
		@NotNull(message = "Date is required")
		LocalDate date,

		@NotBlank(message = "Name is required")
		@Size(max = 100, message = "Name must be at most 100 characters")
		String name) {
}
