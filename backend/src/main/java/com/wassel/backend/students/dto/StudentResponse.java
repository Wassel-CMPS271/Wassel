package com.wassel.backend.students.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A student on the school's roster. Field names and shape match the frontend's mock contract
 * (SCRUM-160) so the mock can be swapped for a real request with no component changes.
 * {@code status} is one of {@code "active"}, {@code "inactive"}. {@code address},
 * {@code latitude}/{@code longitude}, {@code route}, and {@code parentUserId} are null until set
 * via the edit endpoints (SCRUM-166, SCRUM-167).
 */
public record StudentResponse(UUID id, String firstName, String lastName, String grade,
		String guardianName, String guardianPhone, String status, String address, BigDecimal latitude,
		BigDecimal longitude, String route, UUID parentUserId, Instant createdAt) {
}
