package com.wassel.backend.runs.dto;

import com.wassel.backend.runs.entity.ConfirmationStatus;

import java.time.Instant;

/** A student's latest confirmation on a run: the highest status they have, and when it was recorded. */
public record ConfirmationResponse(ConfirmationStatus status, Instant at) {
}
