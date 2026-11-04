package com.wassel.backend.schools.exception;

/**
 * Thrown when a holiday id doesn't exist within the caller's school. Mapped to a 404 by the
 * global exception handler.
 */
public class HolidayNotFoundException extends RuntimeException {

	public HolidayNotFoundException(String message) {
		super(message);
	}
}
