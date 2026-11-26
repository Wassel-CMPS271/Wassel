package com.wassel.backend.students.exception;

/**
 * An import request that is malformed as a whole (no rows, too many, a missing or repeated row number). Answered with
 * a 400 whose {@code errors.students} holds the message; nothing is created.
 */
public class InvalidImportException extends RuntimeException {

	public InvalidImportException(String message) {
		super(message);
	}
}
