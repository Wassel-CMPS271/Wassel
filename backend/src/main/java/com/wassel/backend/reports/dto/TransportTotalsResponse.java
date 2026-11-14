package com.wassel.backend.reports.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * The transport totals for {@code from} to {@code to} (docs/contracts/transport-totals.md). {@code studentsOnRoutes} is
 * the roster as it is when asked, not a figure of the range; {@code days} and {@code total} are what the CSV holds.
 */
public record TransportTotalsResponse(LocalDate from, LocalDate to, long studentsOnRoutes, Totals total,
		List<DayTotals> days) {
}
