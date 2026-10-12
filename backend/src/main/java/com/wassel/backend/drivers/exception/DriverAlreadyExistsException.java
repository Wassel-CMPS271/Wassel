package com.wassel.backend.drivers.exception;

import lombok.Getter;

/**
 * Thrown when a school already has a driver with the requested email or phone number. Carries
 * which field conflicted so the global exception handler can report it against that field.
 * Mapped to a 409.
 */
@Getter
public class DriverAlreadyExistsException extends RuntimeException {

	private final String field;

	public DriverAlreadyExistsException(String field, String message) {
		super(message);
		this.field = field;
	}
}
