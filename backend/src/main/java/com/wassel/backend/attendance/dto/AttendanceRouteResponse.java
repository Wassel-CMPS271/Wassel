package com.wassel.backend.attendance.dto;

import java.util.UUID;

/** A run's route; {@code name} is null when the route has been deleted. */
public record AttendanceRouteResponse(UUID id, String name) {
}
