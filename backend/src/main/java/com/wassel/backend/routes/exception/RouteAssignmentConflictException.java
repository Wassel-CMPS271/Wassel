package com.wassel.backend.routes.exception;

import lombok.Getter;

/**
 * Thrown when a vehicle or driver can't be put on a route: it's already on a different route
 * within the school, or (vehicle only) it's inactive. Carries which field conflicted so the
 * global exception handler can report it against that field. Mapped to a 409.
 */
@Getter
public class RouteAssignmentConflictException extends RuntimeException {

	private final String field;

	public RouteAssignmentConflictException(String field, String message) {
		super(message);
		this.field = field;
	}
}
