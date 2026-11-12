package com.wassel.backend.attendance.dto;

import com.wassel.backend.runs.dto.AttendanceRecord;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One student on one run, for the head of transportation. Built only with {@link #from}, so {@code status} comes from the times. */
public record AttendanceRowResponse(UUID runId, LocalDate date, AttendanceDirection direction,
		AttendanceRouteResponse route, AttendanceStudentResponse student, AttendanceStatus status,
		Instant notPresentAt, Instant pickedUpAt, Instant droppedOffAt) {

	public static AttendanceRowResponse from(AttendanceRecord record, AttendanceRouteResponse route,
			AttendanceStudentResponse student) {
		return new AttendanceRowResponse(record.runId(), record.date(), AttendanceDirection.of(record.direction()),
				route, student, AttendanceStatus.of(record.status()), record.notPresentAt(), record.pickedUpAt(),
				record.droppedOffAt());
	}
}
