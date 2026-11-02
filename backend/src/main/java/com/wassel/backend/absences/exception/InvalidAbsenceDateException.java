package com.wassel.backend.absences.exception;

import lombok.Getter;

/**
 * Thrown when a reported absence's dates don't make sense: {@code fromDate} before today, or
 * {@code toDate} before {@code fromDate}. Carries which field was wrong so the global exception
 * handler can report it against that field, the same "errors" shape as bean validation. Mapped
 * to a 400.
 */
@Getter
public class InvalidAbsenceDateException extends RuntimeException {

	private final String field;

	public InvalidAbsenceDateException(String field, String message) {
		super(message);
		this.field = field;
	}
}
