package com.wassel.backend.users.exception;

/**
 * Thrown when a user id doesn't exist within the caller's school, or exists but doesn't have the
 * required role. Mapped to a 404 by the global exception handler.
 */
public class UserNotFoundException extends RuntimeException {

	public UserNotFoundException(String message) {
		super(message);
	}
}
