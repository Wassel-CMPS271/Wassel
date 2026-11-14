package com.wassel.backend.runs.dto;

import com.wassel.backend.runs.entity.ConfirmationStatus;
import com.wassel.backend.runs.entity.RunDirection;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One stored confirmation with its run, for the pickup/drop-off audit (SCRUM-265). */
public record AuditRecord(UUID id, Instant at, ConfirmationStatus status, UUID runId, UUID routeId, LocalDate date,
		RunDirection direction, UUID studentId) implements RecordedOnRun {
}
