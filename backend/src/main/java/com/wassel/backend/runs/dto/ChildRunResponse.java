package com.wassel.backend.runs.dto;

import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunState;

/**
 * Today's run as a parent sees it for one child (SCRUM-237, docs/contracts/runs.md "Today's run for a child").
 * {@code stopsLeft} is how many stops the bus still has before the child's: 0 means the child is next, and null
 * means no count applies (the run is not in progress, or the child is absent without a confirmation, or already
 * done on it). A count only exists while the run is in progress, and is never negative.
 */
public record ChildRunResponse(RunDirection direction, RunState state, Integer stopsLeft) {

	public ChildRunResponse {
		if (stopsLeft != null && (state != RunState.IN_PROGRESS || stopsLeft < 0)) {
			throw new IllegalArgumentException("stopsLeft needs a run in progress and cannot be negative");
		}
	}
}
