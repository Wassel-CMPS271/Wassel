package com.wassel.backend.auth.exception;

import lombok.Getter;

/** Mapped to a 503 with Retry-After. No more authentication email can be sent today. */
@Getter
public class AuthEmailCapException extends RuntimeException {

	private final long retryAfterSeconds;

	public AuthEmailCapException(long retryAfterSeconds) {
		super("No more sign-in emails can be sent today. Please try again later.");
		this.retryAfterSeconds = retryAfterSeconds;
	}
}
