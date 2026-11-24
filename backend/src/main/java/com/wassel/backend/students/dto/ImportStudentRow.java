package com.wassel.backend.students.dto;

/**
 * One record of an import (docs/contracts/students-import.md). {@code row} is the line of the file it started on, echoed
 * back so the screen can say "Row 7". There is no address: an unknown field in the body, such as an {@code address},
 * is ignored (Jackson's default), never geocoded.
 */
public record ImportStudentRow(Integer row, String firstName, String lastName, String grade, String guardianName,
		String guardianPhone) {
}
