package com.wassel.backend.reports.exception;

import lombok.Getter;

/**
 * Thrown when the date range of a report doesn't make sense: {@code to} before {@code from}, or more days than the
 * limit. Carries which field was wrong so the global exception handler can report it against that field, the same
 * "errors" shape as bean validation. Mapped to a 400.
 */
@Getter
public class InvalidTotalsRangeException extends RuntimeException {

	private final String field;

	public InvalidTotalsRangeException(String field, String message) {
		super(message);
		this.field = field;
	}
}
