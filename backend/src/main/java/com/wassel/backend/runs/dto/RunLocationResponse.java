package com.wassel.backend.runs.dto;

import java.util.UUID;

/** One run's {@link BusLocationResponse} for the head of transportation's list. */
public record RunLocationResponse(UUID runId, LocationStatus status, BusPositionResponse position) {
}
