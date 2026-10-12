package com.wassel.backend.auth.service;

public interface Mailer {

	void send(String to, String subject, String body);
}
