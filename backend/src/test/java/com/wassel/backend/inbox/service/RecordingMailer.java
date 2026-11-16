package com.wassel.backend.inbox.service;

import com.wassel.backend.auth.service.Mailer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.mail.MailSendException;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The mailbox of the delivery tests: stands in for the mail provider, which is outside our code (as the geocoder
 * stand-ins do). It records what it is given and can be told to refuse. Its refusal puts the recipient in the exception
 * message, as a real SMTP error can, so a test can prove the sender never logs that message.
 */
public class RecordingMailer implements Mailer {

	public record Mail(String to, String subject, String body) {
	}

	@TestConfiguration
	public static class Config {

		@Bean
		@Primary
		RecordingMailer recordingMailer() {
			return new RecordingMailer();
		}
	}

	private final List<Mail> sent = new CopyOnWriteArrayList<>();

	private final AtomicInteger calls = new AtomicInteger();

	private final AtomicInteger refuseNext = new AtomicInteger();

	private volatile boolean refuseAll;

	private volatile Runnable whileSending = () -> {
	};

	@Override
	public void send(String to, String subject, String body) {
		calls.incrementAndGet();
		whileSending.run();
		if (refuseAll || refuseNext.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
			throw new MailSendException("The provider refused the message for " + to);
		}
		sent.add(new Mail(to, subject, body));
	}

	public void refuseNext(int times) {
		refuseNext.set(times);
	}

	/** Runs inside each call, before it answers: a provider that takes its time, while something else happens. */
	public void whileSending(Runnable duringTheCall) {
		whileSending = duringTheCall;
	}

	public void refuseAll(boolean refuse) {
		refuseAll = refuse;
	}

	/** What was delivered, in order. */
	public List<Mail> sent() {
		return List.copyOf(sent);
	}

	/** How many times the provider was asked, accepted or not. */
	public int calls() {
		return calls.get();
	}

	public void reset() {
		sent.clear();
		calls.set(0);
		refuseNext.set(0);
		refuseAll = false;
		whileSending = () -> {
		};
	}
}
