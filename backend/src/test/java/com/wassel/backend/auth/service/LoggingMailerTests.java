package com.wassel.backend.auth.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(OutputCaptureExtension.class)
class LoggingMailerTests {

	@Test
	void logsTheRecipientSubjectAndBodyWithTheLink(CapturedOutput output) {
		new LoggingMailer().send("new@wassel.test", "Set your password",
				"Open http://localhost:3000/set-password?token=abc");

		assertTrue(output.getOut().contains("new@wassel.test"));
		assertTrue(output.getOut().contains("Set your password"));
		assertTrue(output.getOut().contains("http://localhost:3000/set-password?token=abc"));
	}
}
