package com.wassel.backend.runs.dto;

import java.time.Instant;

/** A student's latest confirmation on a run. Always null on a stop until SCRUM-235 records them. */
public record ConfirmationResponse(String status, Instant at) {
}
