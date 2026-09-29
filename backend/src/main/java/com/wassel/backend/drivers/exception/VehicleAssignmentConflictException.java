package com.wassel.backend.drivers.exception;

/**
 * Thrown when a vehicle can't be assigned to a driver: the vehicle is deactivated, or it's
 * already assigned to a different driver. Mapped to a 409 by the global exception handler.
 */
public class VehicleAssignmentConflictException extends RuntimeException {

	public VehicleAssignmentConflictException(String message) {
		super(message);
	}
}
