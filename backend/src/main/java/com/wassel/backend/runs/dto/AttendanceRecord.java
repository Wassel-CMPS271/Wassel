package com.wassel.backend.runs.dto;

import com.wassel.backend.runs.entity.ConfirmationStatus;
import com.wassel.backend.runs.entity.RunDirection;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One student's recorded statuses on one run, for the attendance history (SCRUM-265). A time is null when that status
 * was never recorded, but a record has at least one: a row exists only because a status was recorded.
 */
public record AttendanceRecord(UUID runId, UUID routeId, LocalDate date, RunDirection direction, UUID studentId,
		Instant notPresentAt, Instant pickedUpAt, Instant droppedOffAt) implements RecordedOnRun {

	public AttendanceRecord {
		if (notPresentAt == null && pickedUpAt == null && droppedOffAt == null) {
			throw new IllegalArgumentException("No status recorded for student " + studentId + " on run " + runId);
		}
	}

	/** The highest status recorded, as everywhere else ({@link ConfirmationStatus}), never the newest time. */
	public ConfirmationStatus status() {
		return droppedOffAt != null ? ConfirmationStatus.DROPPED_OFF
				: pickedUpAt != null ? ConfirmationStatus.PICKED_UP : ConfirmationStatus.NOT_PRESENT;
	}
}
