package com.wassel.backend.drivers.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A driver on the school's roster. Field names and shape match the frontend's mock contract
 * (SCRUM-159) so the mock can be swapped for a real request with no component changes.
 * {@code status} is one of {@code "invited"}, {@code "active"}, {@code "deactivated"}.
 */
public record DriverResponse(UUID id, String firstName, String lastName, String phone, String email,
		String status, Instant invitedAt, UUID assignedVehicleId) {
}
