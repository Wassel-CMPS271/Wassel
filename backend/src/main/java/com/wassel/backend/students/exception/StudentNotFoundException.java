package com.wassel.backend.students.exception;

/**
 * Thrown when a student id doesn't exist within the caller's school. Mapped to a 404 by the
 * global exception handler.
 */
public class StudentNotFoundException extends RuntimeException {

	public StudentNotFoundException(String message) {
		super(message);
	}
}
