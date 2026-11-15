package com.wassel.backend.addressrequests.exception;

/**
 * Thrown when a request can't be sent or decided because of the state of another one: the child already has a
 * pending request, or this one is no longer pending. Mapped to a 409 with the message as the detail.
 */
public class AddressRequestConflictException extends RuntimeException {

	public AddressRequestConflictException(String message) {
		super(message);
	}
}
