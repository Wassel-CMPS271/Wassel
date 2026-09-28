package com.wassel.backend.schools.exception;

/**
 * Thrown when a date can't be added to the school calendar because it is already taken, for
 * example a half-day on a date that is already a holiday, or the reverse. Mapped to a 409 by
 * the global exception handler.
 */
public class CalendarDateConflictException extends RuntimeException {

	public CalendarDateConflictException(String message) {
		super(message);
	}
}
