package com.wassel.backend.runs.exception;

/**
 * Thrown when a run's state does not allow the move: starting a finished run, or ending one that has not
 * started. Mapped to a 409 by the global exception handler; the message names the run's state.
 */
public class RunStateConflictException extends RuntimeException {

	public RunStateConflictException(String message) {
		super(message);
	}
}
