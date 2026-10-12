package com.wassel.backend.auth.exception;

/** Mapped to a 429. A code was sent less than a minute ago. */
public class CodeCooldownException extends RuntimeException {

	public CodeCooldownException() {
		super("Please wait a minute before requesting another code.");
	}
}
