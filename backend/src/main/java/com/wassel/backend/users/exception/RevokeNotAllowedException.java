package com.wassel.backend.users.exception;

/**
 * Thrown when someone tries to revoke their own access. Mapped to a 403 by the global exception
 * handler.
 */
public class RevokeNotAllowedException extends RuntimeException {

	public RevokeNotAllowedException(String message) {
		super(message);
	}
}
