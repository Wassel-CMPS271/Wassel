package com.wassel.backend.auth.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Sends plain-text email through the SMTP server in {@code spring.mail.*}. A failed send is an
 * unchecked exception, so it rolls back the caller's transaction and the request fails; the user
 * retries. It runs in every profile except local and test, which print the email instead
 * ({@link LoggingMailer}), so a deployed environment never writes a code or link to its log.
 */
@Component
@Profile("!local & !test")
public class SmtpMailer implements Mailer {

	private final JavaMailSender sender;

	// Gmail sends as the account it signed in with whatever "from" says, so the sender is that account.
	private final String from;

	public SmtpMailer(JavaMailSender sender, @Value("${spring.mail.username}") String from) {
		this.sender = sender;
		this.from = from;
	}

	@Override
	public void send(String to, String subject, String body) {
		SimpleMailMessage message = new SimpleMailMessage();
		message.setFrom(from);
		message.setTo(to);
		message.setSubject(subject);
		message.setText(body);
		sender.send(message);
	}
}
