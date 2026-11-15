package com.wassel.backend.runs.dto;

import com.wassel.backend.routes.dto.RouteDriverSummary;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunState;

import java.time.Instant;
import java.util.UUID;

/** One entry of a run's reassignment list (docs/contracts/runs.md, {@code Reassignment}). */
public record ReassignmentResponse(
		UUID id,
		UUID runId,
		RunDirection direction,
		RunState runState,
		RouteDriverSummary fromDriver,
		RouteDriverSummary toDriver,
		ReassignmentActorResponse changedBy,
		Instant changedAt,
		String reason) {
}
