package com.wassel.backend.drivers.exception;

/**
 * Thrown when an action doesn't make sense for a driver's current status, e.g. resending an
 * invite to a driver who has already accepted it, or assigning a deactivated driver to a
 * vehicle. Mapped to a 409 by the global exception handler.
 */
public class DriverStatusConflictException extends RuntimeException {

	public DriverStatusConflictException(String message) {
		super(message);
	}
}
