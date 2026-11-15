package com.wassel.backend.runs.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * The body of {@code POST .../reassignments}. {@code fromDriverId} is the driver the head saw on the run, so two heads
 * acting on the same screen cannot both succeed. A blank {@code reason} is stored as null.
 */
public record ReassignRunRequest(
		@NotNull UUID driverId,
		@NotNull UUID fromDriverId,
		@Size(max = 200) String reason) {

	public ReassignRunRequest {
		reason = reason == null || reason.isBlank() ? null : reason.trim();
	}
}
