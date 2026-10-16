package com.wassel.backend.routes.exception;

/**
 * Thrown when adding a student would put more students on the route than the vehicle has seats.
 * The message, not a field error, names the current count and the capacity (routing contract).
 * Mapped to a 409 by the global exception handler.
 */
public class RouteCapacityExceededException extends RuntimeException {

	public RouteCapacityExceededException(String message) {
		super(message);
	}
}
