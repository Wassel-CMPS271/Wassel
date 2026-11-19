package com.wassel.backend.students.exception;

/**
 * Thrown when a student cannot go from the status they have to the one asked for (an archived student can only be
 * restored to active). Mapped to a 409 by the global exception handler.
 */
public class StudentStatusConflictException extends RuntimeException {

	public StudentStatusConflictException(String message) {
		super(message);
	}
}
