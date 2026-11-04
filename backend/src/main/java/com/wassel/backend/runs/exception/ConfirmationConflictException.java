package com.wassel.backend.runs.exception;

/**
 * Thrown when a confirmation is a move the contract's table refuses, such as dropping a student off who was never
 * picked up. Mapped to a 409 by the global exception handler; the message names the student's current status.
 */
public class ConfirmationConflictException extends RuntimeException {

	public ConfirmationConflictException(String message) {
		super(message);
	}
}
