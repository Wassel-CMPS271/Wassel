package com.wassel.backend.schools.exception;

/**
 * Thrown when a school already has a holiday on the requested date. Mapped to a 409 by the
 * global exception handler.
 */
public class HolidayAlreadyExistsException extends RuntimeException {

	public HolidayAlreadyExistsException(String message) {
		super(message);
	}
}
