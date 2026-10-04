package com.wassel.backend.common.exception;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.security.access.AccessDeniedException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(OutputCaptureExtension.class)
class GlobalExceptionHandlerLoggingTests {

	private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

	@Test
	void unexpectedFailureIsLoggedAtErrorWithTheStackTrace(CapturedOutput output) {
		handler.handleUnexpected(new IllegalStateException("database unreachable"));

		assertTrue(output.getOut().contains("ERROR"), output.getAll());
		assertTrue(output.getOut().contains("Unhandled exception"), output.getAll());
		assertTrue(output.getOut().contains("IllegalStateException: database unreachable"), output.getAll());
	}

	@Test
	void clientMistakeIsLoggedAtWarnWithoutAStackTrace(CapturedOutput output) {
		handler.handleAccessDenied(new AccessDeniedException("not an admin"));

		assertTrue(output.getOut().contains("WARN"), output.getAll());
		assertTrue(output.getOut().contains("Request rejected: AccessDeniedException: not an admin"), output.getAll());
		assertFalse(output.getOut().contains("ERROR"), output.getAll());
		assertFalse(output.getOut().contains("\tat "), "a rejected request should not log a stack trace");
	}
}
