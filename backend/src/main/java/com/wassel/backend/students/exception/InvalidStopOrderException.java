package com.wassel.backend.students.exception;

/**
 * Thrown when a new stop order repeats a student, or doesn't contain exactly the route's current
 * stops (missing one, or including one that isn't a stop on this route at all). Mapped to a 400
 * by the global exception handler, the same as other business-rule input problems.
 */
public class InvalidStopOrderException extends RuntimeException {

	public InvalidStopOrderException(String message) {
		super(message);
	}
}
