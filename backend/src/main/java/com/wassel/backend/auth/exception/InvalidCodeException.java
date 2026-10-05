package com.wassel.backend.auth.exception;

/** Mapped to a 400. A wrong code and an expired one fail the same way; the user can retry or resend. */
public class InvalidCodeException extends RuntimeException {

	public InvalidCodeException() {
		super("That code is incorrect or has expired.");
	}
}
