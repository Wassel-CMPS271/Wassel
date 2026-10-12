package com.wassel.backend.vehicles.exception;

/**
 * Thrown when a school already has a vehicle with the requested plate number. Mapped to a 409
 * by the global exception handler.
 */
public class VehicleAlreadyExistsException extends RuntimeException {

	public VehicleAlreadyExistsException(String message) {
		super(message);
	}
}
