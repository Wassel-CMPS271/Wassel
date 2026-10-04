package com.wassel.backend.auth.exception;

/** Mapped to a 401. The message is the same for every login failure, so accounts can't be enumerated. */
public class InvalidCredentialsException extends RuntimeException {

	public InvalidCredentialsException() {
		super("Invalid email or password.");
	}
}
