package com.wassel.backend.runs.exception;

/**
 * Thrown when a run is not one of the signed-in driver's runs for today. Mapped to a 404 by the global
 * exception handler.
 */
public class RunNotFoundException extends RuntimeException {

	public RunNotFoundException(String message) {
		super(message);
	}
}
