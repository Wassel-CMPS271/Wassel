package com.wassel.backend.students.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

/** {@code student} when created, {@code errors} (field to message) when rejected: never both, never neither. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ImportRowResult(int row, String status, StudentResponse student, Map<String, String> errors) {

	public static ImportRowResult created(int row, StudentResponse student) {
		return new ImportRowResult(row, "created", student, null);
	}

	public static ImportRowResult rejected(int row, Map<String, String> errors) {
		return new ImportRowResult(row, "rejected", null, errors);
	}
}
