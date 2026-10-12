package com.wassel.backend.schools.exception;

/**
 * Thrown when a school's arrival/dismissal times are individually valid but inconsistent
 * with each other. Mapped to a 400 by the global exception handler.
 */
public class InvalidSchoolTimesException extends RuntimeException {

	public InvalidSchoolTimesException(String message) {
		super(message);
	}
}
