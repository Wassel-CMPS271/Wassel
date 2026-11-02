package com.wassel.backend.absences.exception;

/**
 * Thrown when cancelling an absence whose {@code toDate} is already before today: it ran its
 * course and there's nothing left to cancel. Mapped to a 409, a plain detail (no field), the
 * same shape {@code RouteCapacityExceededException} uses.
 */
public class AbsenceNotCancellableException extends RuntimeException {

	public AbsenceNotCancellableException(String message) {
		super(message);
	}
}
