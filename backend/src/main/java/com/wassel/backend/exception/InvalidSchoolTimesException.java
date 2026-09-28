package com.wassel.backend.exception;

/**
 * Thrown when a school's arrival/dismissal times are individually valid but inconsistent
 * with each other. Mapped to a 400 by {@link GlobalExceptionHandler}.
 */
public class InvalidSchoolTimesException extends RuntimeException {

	public InvalidSchoolTimesException(String message) {
		super(message);
	}
}
