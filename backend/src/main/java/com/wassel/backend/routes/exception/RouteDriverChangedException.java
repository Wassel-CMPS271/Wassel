package com.wassel.backend.routes.exception;

/**
 * Thrown when a route's driver is no longer the one the caller expected, so someone else changed it first. Mapped
 * to a 409 by the global exception handler; the message names the current driver.
 */
public class RouteDriverChangedException extends RuntimeException {

	public RouteDriverChangedException(String message) {
		super(message);
	}
}
