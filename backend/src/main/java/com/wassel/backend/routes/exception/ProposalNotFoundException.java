package com.wassel.backend.routes.exception;

/**
 * Thrown when a proposal id is unknown, was discarded or replaced, or belongs to another route
 * or school. Mapped to a 404 by the global exception handler.
 */
public class ProposalNotFoundException extends RuntimeException {

	public ProposalNotFoundException(String message) {
		super(message);
	}
}
