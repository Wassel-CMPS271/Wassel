package com.wassel.backend.attendance.dto;

import com.wassel.backend.runs.dto.AuditRecord;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One recorded confirmation; {@code at} is when the server recorded it. */
public record AuditEntryResponse(UUID id, Instant at, AttendanceStatus status, UUID runId, LocalDate date,
		AttendanceDirection direction, AttendanceRouteResponse route, AttendanceStudentResponse student) {

	public static AuditEntryResponse from(AuditRecord record, AttendanceRouteResponse route,
			AttendanceStudentResponse student) {
		return new AuditEntryResponse(record.id(), record.at(), AttendanceStatus.of(record.status()), record.runId(),
				record.date(), AttendanceDirection.of(record.direction()), route, student);
	}
}
