package com.wassel.backend.runs.dto;

import java.util.UUID;

/** A child and the route they are on now: what the parent module hands {@code RunService.todayRunStatus}. */
public record ChildOnRoute(UUID studentId, UUID routeId) {
}
