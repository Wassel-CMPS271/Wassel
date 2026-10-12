package com.wassel.backend.vehicles.exception;

/**
 * Thrown when a vehicle id doesn't exist within the caller's school. Mapped to a 404 by the
 * global exception handler.
 */
public class VehicleNotFoundException extends RuntimeException {

	public VehicleNotFoundException(String message) {
		super(message);
	}
}
