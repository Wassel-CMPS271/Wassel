package com.wassel.backend.addressrequests.exception;

import lombok.Getter;

/**
 * Thrown when a request's content doesn't make sense and bean validation can't say so: a pin with only one
 * coordinate, or the address the child already has. Carries which field was wrong so the global exception handler
 * can report it against that field, the same "errors" shape as bean validation. Mapped to a 400.
 */
@Getter
public class InvalidAddressRequestException extends RuntimeException {

	private final String field;

	public InvalidAddressRequestException(String field, String message) {
		super(message);
		this.field = field;
	}
}
