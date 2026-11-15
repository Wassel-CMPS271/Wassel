package com.wassel.backend.inbox.exception;

/**
 * Thrown when an inbox entry doesn't exist or isn't the signed-in parent's, so nothing tells the two apart. Mapped to
 * a 404 by the global exception handler.
 */
public class InboxEventNotFoundException extends RuntimeException {

	public InboxEventNotFoundException(String message) {
		super(message);
	}
}
