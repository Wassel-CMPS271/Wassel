package com.wassel.backend.runs.dto;

import java.time.Instant;

/**
 * A live estimate of when the bus reaches a stop (SCRUM-262, docs/contracts/runs.md "Live ETA and stop progress").
 * {@code secondsAway} is counted by the server's clock when the answer was made and is never negative, so a client
 * needs no clock of its own. It is not the planned time.
 */
public record EstimateResponse(Instant arrivesAt, long secondsAway) {

	public EstimateResponse {
		if (arrivesAt == null || secondsAway < 0) {
			throw new IllegalArgumentException("An estimate needs a moment and is never in the past");
		}
	}
}
