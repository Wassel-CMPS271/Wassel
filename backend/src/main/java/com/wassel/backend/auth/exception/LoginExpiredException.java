package com.wassel.backend.auth.exception;

/** Mapped to a 401. The pending login is gone (unknown, too old, used, out of attempts); sign in again. */
public class LoginExpiredException extends RuntimeException {

	public LoginExpiredException() {
		super("Your sign-in has expired. Please sign in again.");
	}
}
