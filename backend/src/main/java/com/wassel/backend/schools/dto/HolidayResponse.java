package com.wassel.backend.schools.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A holiday on a school's calendar. The date is an ISO calendar date, e.g. {@code "2026-12-25"}.
 */
public record HolidayResponse(UUID id, LocalDate date, String name) {
}
