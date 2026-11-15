package com.wassel.backend.attendance.dto;

import java.util.UUID;

/** The student of a row or entry: id and name only, for the head of transportation. */
public record AttendanceStudentResponse(UUID id, String firstName, String lastName) {
}
