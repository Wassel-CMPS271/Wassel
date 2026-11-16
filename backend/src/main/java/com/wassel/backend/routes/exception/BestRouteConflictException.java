package com.wassel.backend.routes.exception;

/**
 * Thrown when a student cannot be placed by the best-route insertion (SCRUM-270): they are already on a route, have no
 * pin, the school has no arrival time, no route can take them, or the route changed while it was being chosen. Mapped to
 * a 409 by the global exception handler.
 */
public class BestRouteConflictException extends RuntimeException {

	public BestRouteConflictException(String message) {
		super(message);
	}
}
