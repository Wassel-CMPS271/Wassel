package com.wassel.backend.schools.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * The date is sent as an ISO calendar date (e.g. {@code "2026-12-24"}); impossible dates such
 * as {@code "2026-02-30"} are rejected as an unreadable body.
 */
public record CreateHalfDayRequest(
		@NotNull(message = "Date is required")
		LocalDate date) {
}
