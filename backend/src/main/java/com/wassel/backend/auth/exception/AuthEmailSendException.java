package com.wassel.backend.auth.exception;

import com.wassel.backend.auth.entity.AuthEmailKind;

import java.util.UUID;

/**
 * The mail provider failed to send a sign-in code. Answered as a generic 500, like any unexpected failure. It carries the
 * kind, the user's id and the provider failure's class, and deliberately not the failure itself: a provider's message
 * can hold the recipient's address (an SMTP "invalid address" error does), and the handler logs this exception's stack.
 */
public class AuthEmailSendException extends RuntimeException {

	public AuthEmailSendException(AuthEmailKind kind, UUID userId, RuntimeException failure) {
		super("The %s email for user %s was not sent (%s)".formatted(kind, userId, failure.getClass().getSimpleName()));
	}
}
