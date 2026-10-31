package com.wassel.backend.routes.exception;

/**
 * Thrown when a change would pull a student, driver or vehicle out from under a run that is in progress.
 * The message says which run and what to wait for. Mapped to a 409.
 */
public class ActiveRunConflictException extends RuntimeException {

	public ActiveRunConflictException(String message) {
		super(message);
	}
}
