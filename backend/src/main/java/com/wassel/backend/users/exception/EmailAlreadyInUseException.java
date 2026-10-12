package com.wassel.backend.users.exception;

/**
 * Thrown when an account is created with an email that already belongs to another user. Emails
 * are unique across the whole platform. Mapped to a 409 by the global exception handler.
 */
public class EmailAlreadyInUseException extends RuntimeException {

	public EmailAlreadyInUseException(String message) {
		super(message);
	}
}
