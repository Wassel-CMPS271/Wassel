package com.wassel.backend.students.exception;

/**
 * Thrown when a school already has a student with the same first name, last name, and guardian
 * phone number. Mapped to a 409 by the global exception handler.
 */
public class StudentAlreadyExistsException extends RuntimeException {

	public StudentAlreadyExistsException(String message) {
		super(message);
	}
}
