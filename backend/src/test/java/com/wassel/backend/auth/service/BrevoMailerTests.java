package com.wassel.backend.auth.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class BrevoMailerTests {

	// Made-up values: the tests never use a real key.
	private static final String API_KEY = "test-key-not-real";

	private final RestClient.Builder builder = RestClient.builder();

	private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

	private BrevoMailer mailer() {
		return new BrevoMailer(BrevoMailer.configure(builder, "https://brevo.test", API_KEY), "wassel@example.test",
				"Wassel");
	}

	@Test
	void postsAPlainTextMessageFromTheVerifiedSenderToTheRecipient() {
		server.expect(requestTo("https://brevo.test/v3/smtp/email"))
				.andExpect(method(HttpMethod.POST))
				.andExpect(header("api-key", API_KEY))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(jsonPath("$.sender.email").value("wassel@example.test"))
				.andExpect(jsonPath("$.sender.name").value("Wassel"))
				.andExpect(jsonPath("$.to[0].email").value("new@wassel.test"))
				.andExpect(jsonPath("$.subject").value("Your Wassel verification code"))
				.andExpect(jsonPath("$.textContent").value("Your verification code is 123456."))
				.andRespond(withSuccess("{\"messageId\":\"<x@y>\"}", MediaType.APPLICATION_JSON));

		mailer().send("new@wassel.test", "Your Wassel verification code", "Your verification code is 123456.");

		server.verify();
	}

	// What makes a login retryable: the failure reaches the caller instead of being swallowed.
	@Test
	void aRejectedSendReachesTheCaller() {
		server.expect(requestTo("https://brevo.test/v3/smtp/email"))
				.andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("{\"message\":\"Key not found\"}")
						.contentType(MediaType.APPLICATION_JSON));

		assertThrows(MailSendException.class, () -> mailer().send("new@wassel.test", "Subject", "Body"));
	}

	@Test
	void aProviderOutageReachesTheCaller() {
		server.expect(requestTo("https://brevo.test/v3/smtp/email")).andRespond(withServerError());

		assertThrows(MailSendException.class, () -> mailer().send("new@wassel.test", "Subject", "Body"));
	}

	@Test
	void theFailureNeverCarriesTheKeyOrTheResponseBody() {
		server.expect(requestTo("https://brevo.test/v3/smtp/email"))
				.andRespond(withStatus(HttpStatus.BAD_REQUEST).body("secret-response-detail new@wassel.test")
						.contentType(MediaType.APPLICATION_JSON));

		MailSendException failure = assertThrows(MailSendException.class,
				() -> mailer().send("new@wassel.test", "Subject", "Body"));

		assertFalse(failure.getMessage().contains(API_KEY));
		assertFalse(failure.getMessage().contains("secret-response-detail"));
		assertTrue(failure.getMessage().startsWith("Brevo did not accept the email"));
	}

	@Test
	void aMissingKeyOrSenderStopsStartup() {
		assertThrows(IllegalStateException.class,
				() -> new BrevoMailer(RestClient.builder(), "", "wassel@example.test", "Wassel", "https://brevo.test"));
		assertThrows(IllegalStateException.class,
				() -> new BrevoMailer(RestClient.builder(), API_KEY, " ", "Wassel", "https://brevo.test"));
	}
}
