package com.wassel.backend.students.exception;

/**
 * Thrown when a route tries to add a student whose status isn't active. Mapped to a 409 by the
 * global exception handler.
 */
public class StudentNotActiveException extends RuntimeException {

	public StudentNotActiveException(String message) {
		super(message);
	}
}
