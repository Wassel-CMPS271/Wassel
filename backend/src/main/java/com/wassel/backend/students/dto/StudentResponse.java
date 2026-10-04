package com.wassel.backend.students.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A student on the school's roster. Field names and shape match the frontend's mock contract
 * (SCRUM-160) so the mock can be swapped for a real request with no component changes.
 * {@code status} is one of {@code "active"}, {@code "inactive"}.
 */
public record StudentResponse(UUID id, String firstName, String lastName, String grade,
		String guardianName, String guardianPhone, String status, Instant createdAt) {
}
