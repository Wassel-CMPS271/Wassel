package com.wassel.backend.schools.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A half-day on a school's calendar. The date is an ISO calendar date, e.g. {@code "2026-12-24"}.
 */
public record HalfDayResponse(UUID id, LocalDate date) {
}
