package com.wassel.backend.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Prints the email to the application log instead of sending it. Links in the log let anyone who
 * can read it take over an account, so replace this with a real implementation before inviting
 * real users.
 */
@Slf4j
@Component
public class LoggingMailer implements Mailer {

	@Override
	public void send(String to, String subject, String body) {
		log.info("Email to {} | {}\n{}", to, subject, body);
	}
}
