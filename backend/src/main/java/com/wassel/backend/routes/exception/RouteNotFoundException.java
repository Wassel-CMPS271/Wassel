package com.wassel.backend.routes.exception;

/**
 * Thrown when a route id doesn't exist within the caller's school. Mapped to a 404 by the
 * global exception handler.
 */
public class RouteNotFoundException extends RuntimeException {

	public RouteNotFoundException(String message) {
		super(message);
	}
}
