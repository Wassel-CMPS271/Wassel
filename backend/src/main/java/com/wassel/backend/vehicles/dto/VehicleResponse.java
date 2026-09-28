package com.wassel.backend.vehicles.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A vehicle in the school's fleet. Field names and shape match the frontend's mock contract
 * (SCRUM-158) so the mock can be swapped for a real request with no component changes.
 */
public record VehicleResponse(UUID id, String plateNumber, int capacity, boolean isActive, Instant createdAt) {
}
