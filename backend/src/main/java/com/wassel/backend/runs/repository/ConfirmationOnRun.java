package com.wassel.backend.runs.repository;

import com.wassel.backend.runs.entity.ConfirmationStatus;

import java.time.Instant;
import java.util.UUID;

/** One of a student's confirmations with the route of its run: a row of {@link ConfirmationRepository#findOnRunsInProgress}. */
public record ConfirmationOnRun(UUID routeId, ConfirmationStatus status, Instant confirmedAt) {
}
