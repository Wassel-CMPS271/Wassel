package com.wassel.backend.auth.exception;

/** Mapped to a 400. Unknown, expired and used tokens (and disabled accounts) all fail the same way. */
public class InvalidPasswordTokenException extends RuntimeException {

	public InvalidPasswordTokenException() {
		super("This link is invalid or has expired.");
	}
}
