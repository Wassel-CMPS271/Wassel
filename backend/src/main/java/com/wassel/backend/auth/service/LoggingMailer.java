package com.wassel.backend.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Prints the email to the application log instead of sending it, so a developer can copy a login
 * code or link from the console. It runs only in the local and test profiles: a link or code in a
 * deployed environment's log would let anyone who can read it take over an account, so every other
 * profile uses {@link SmtpMailer}.
 */
@Slf4j
@Component
@Profile({ "local", "test" })
public class LoggingMailer implements Mailer {

	@Override
	public void send(String to, String subject, String body) {
		log.info("Email to {} | {}\n{}", to, subject, body);
	}
}
