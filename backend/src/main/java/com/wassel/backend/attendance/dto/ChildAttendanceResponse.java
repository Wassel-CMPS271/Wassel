package com.wassel.backend.attendance.dto;

import com.wassel.backend.runs.dto.AttendanceRecord;

import java.time.Instant;
import java.time.LocalDate;

/**
 * One run a child has a status on, as their parent sees it: no run, route, driver or other child. Built only with
 * {@link #from}, so {@code status} always comes from the same record as the times it is derived from.
 */
public record ChildAttendanceResponse(LocalDate date, AttendanceDirection direction, AttendanceStatus status,
		Instant notPresentAt, Instant pickedUpAt, Instant droppedOffAt) {

	public static ChildAttendanceResponse from(AttendanceRecord record) {
		return new ChildAttendanceResponse(record.date(), AttendanceDirection.of(record.direction()),
				AttendanceStatus.of(record.status()), record.notPresentAt(), record.pickedUpAt(),
				record.droppedOffAt());
	}
}
