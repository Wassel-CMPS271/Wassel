package com.wassel.backend.absences.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * {@code toDate} is optional and defaults to {@code fromDate} (a single day). Whether
 * {@code fromDate} is today or later, and {@code toDate} isn't before {@code fromDate}, needs
 * "today" from the shared {@code Clock}, so it's checked in {@code AbsenceService}, not here —
 * the same split {@code schools.dto.CreateHolidayRequest} draws between "a date is present" and
 * "the date makes sense".
 */
public record ReportAbsenceRequest(
		@NotNull(message = "From date is required")
		LocalDate fromDate,

		LocalDate toDate) {
}
