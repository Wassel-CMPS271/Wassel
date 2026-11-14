package com.wassel.backend.runs.dto;

import java.util.UUID;

/**
 * One run's position for the head of transportation's list, with how far the run has got (SCRUM-262):
 * {@code remainingStops} are the stops still to do, and {@code nextStop} the first of them, null exactly when there
 * are none.
 */
public record RunLocationResponse(UUID runId, LocationStatus status, BusPositionResponse position, int remainingStops,
		NextStopResponse nextStop) {

	public RunLocationResponse {
		if (remainingStops < 0 || (nextStop == null) != (remainingStops == 0)) {
			throw new IllegalArgumentException("A next stop exists exactly when stops remain");
		}
	}
}
