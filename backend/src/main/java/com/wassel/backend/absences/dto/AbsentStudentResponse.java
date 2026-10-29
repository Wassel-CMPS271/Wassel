package com.wassel.backend.absences.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * An absence seen from the head of transportation's side, matching
 * {@code docs/contracts/samples/runs/hot-absences.json}. {@code route} and {@code position} are
 * both null for a student with no route; {@code position} is their 1-based place among the
 * route's stops (see {@code routes.dto.StudentRouteResponse}), never the raw stop-position
 * watermark.
 */
public record AbsentStudentResponse(UUID absenceId, UUID studentId, String firstName, String lastName,
		LocalDate fromDate, LocalDate toDate, AbsentStudentRouteResponse route, Integer position) {
}
