package com.wassel.backend.addressrequests.exception;

/**
 * Thrown when a request id doesn't exist or belongs to another school. Mapped to a 404 by the global exception
 * handler. A child that isn't the signed-in parent's is the students-owned 404
 * ({@code students.exception.StudentNotFoundException}), thrown by the service itself.
 */
public class AddressRequestNotFoundException extends RuntimeException {

	public AddressRequestNotFoundException(String message) {
		super(message);
	}
}
