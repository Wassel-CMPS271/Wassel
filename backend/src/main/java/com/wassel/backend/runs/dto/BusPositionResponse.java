package com.wassel.backend.runs.dto;

import java.time.Instant;

/** A position and how old it is, measured by the server (docs/contracts/runs.md "BusLocation"). */
public record BusPositionResponse(double latitude, double longitude, double accuracyMeters, Instant receivedAt,
		long ageSeconds) {
}
