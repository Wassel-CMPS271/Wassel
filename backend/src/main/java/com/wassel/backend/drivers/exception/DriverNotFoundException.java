package com.wassel.backend.drivers.exception;

/**
 * Thrown when a driver id doesn't exist within the caller's school. Mapped to a 404 by the
 * global exception handler.
 */
public class DriverNotFoundException extends RuntimeException {

	public DriverNotFoundException(String message) {
		super(message);
	}
}
