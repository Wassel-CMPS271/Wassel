package com.wassel.backend.auth.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SmtpMailerTests {

	private final JavaMailSender sender = mock(JavaMailSender.class);

	private final SmtpMailer mailer = new SmtpMailer(sender, "wassel@example.test");

	@Test
	void sendsAPlainTextMessageFromTheConfiguredAccountToTheRecipient() {
		mailer.send("new@wassel.test", "Your Wassel verification code", "Your verification code is 123456.");

		ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
		verify(sender).send(sent.capture());
		assertEquals("wassel@example.test", sent.getValue().getFrom());
		assertArrayEquals(new String[] { "new@wassel.test" }, sent.getValue().getTo());
		assertEquals("Your Wassel verification code", sent.getValue().getSubject());
		assertEquals("Your verification code is 123456.", sent.getValue().getText());
	}

	// What makes a login retryable: the exception reaches the caller instead of being swallowed.
	@Test
	void aFailedSendReachesTheCaller() {
		doThrow(new MailSendException("smtp down")).when(sender).send(any(SimpleMailMessage.class));

		assertThrows(MailSendException.class, () -> mailer.send("new@wassel.test", "Subject", "Body"));
	}
}
