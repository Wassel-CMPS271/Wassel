package com.wassel.backend.runs.exception;

import java.util.UUID;

/**
 * Thrown when a driver's {@code clientRequestId} was already used for a different run, student or status
 * (SCRUM-263). Mapped to a 422 by the global exception handler.
 */
public class ConfirmationKeyReusedException extends RuntimeException {

	public ConfirmationKeyReusedException(UUID clientRequestId) {
		super("clientRequestId " + clientRequestId + " was already used for a different confirmation");
	}
}
