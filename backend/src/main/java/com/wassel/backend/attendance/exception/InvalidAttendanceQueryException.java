package com.wassel.backend.attendance.exception;

import lombok.Getter;

/**
 * Thrown when a query for the attendance history makes no sense: {@code to} before {@code from}, a range over 62
 * days, a negative page, a size outside 1 to 200, or a parameter given more than once. Carries the parameter that was
 * wrong so the error is reported against it, the same "errors" shape as bean validation. Mapped to a 400.
 */
@Getter
public class InvalidAttendanceQueryException extends RuntimeException {

	private final String field;

	public InvalidAttendanceQueryException(String field, String message) {
		super(message);
		this.field = field;
	}
}
