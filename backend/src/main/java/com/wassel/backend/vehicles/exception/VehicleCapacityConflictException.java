package com.wassel.backend.vehicles.exception;

/**
 * Thrown when a vehicle's capacity would be set below the number of students already on the
 * route it is assigned to. The message, not a field error, names the current count and the
 * capacity, the same style {@code RouteCapacityExceededException} uses. Mapped to a 409 by the
 * global exception handler.
 */
public class VehicleCapacityConflictException extends RuntimeException {

	public VehicleCapacityConflictException(String message) {
		super(message);
	}
}
