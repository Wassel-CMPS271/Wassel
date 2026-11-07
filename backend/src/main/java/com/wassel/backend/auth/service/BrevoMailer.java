package com.wassel.backend.auth.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.mail.MailSendException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Sends plain-text email through Brevo's HTTPS API instead of SMTP, for hosts that block outbound
 * SMTP (Railway allows it only on its Pro plan). It runs only when {@code wassel.mail.provider} is
 * {@code brevo}, and like {@link SmtpMailer} only outside the local and test profiles, so exactly
 * one {@link Mailer} exists in every setup and a deployed environment never prints a code or link.
 * A failed send is an unchecked exception, so it rolls back the caller's transaction and the
 * request fails; the user retries.
 *
 * <p>Brevo only sends from a sender address that has been verified in the account, so
 * {@code senderEmail} must be that address. Neither the API key nor the response body is logged or
 * put in the exception: the key is a credential, and a rejected request's body can echo the email.
 */
@Component
@Profile("!local & !test")
@ConditionalOnProperty(name = "wassel.mail.provider", havingValue = "brevo")
public class BrevoMailer implements Mailer {

	private static final Duration TIMEOUT = Duration.ofSeconds(5);

	private final RestClient restClient;

	private final String senderEmail;

	private final String senderName;

	// No defaults for the key and the sender: a missing one stops startup, as a missing MAIL_USERNAME
	// does for SmtpMailer, instead of failing on the first login.
	@Autowired
	public BrevoMailer(RestClient.Builder restClientBuilder, @Value("${wassel.mail.brevo.api-key}") String apiKey,
			@Value("${wassel.mail.brevo.sender-email}") String senderEmail,
			@Value("${wassel.mail.brevo.sender-name:Wassel}") String senderName,
			@Value("${wassel.mail.brevo.base-url:https://api.brevo.com}") String baseUrl) {
		if (apiKey.isBlank() || senderEmail.isBlank()) {
			throw new IllegalStateException("BREVO_API_KEY and BREVO_SENDER_EMAIL must be set when MAIL_PROVIDER=brevo");
		}
		this.restClient = configure(restClientBuilder.requestFactory(withTimeouts()), baseUrl, apiKey);
		this.senderEmail = senderEmail.trim();
		this.senderName = senderName;
	}

	// For tests, which pass a client that already has a stand-in request factory.
	BrevoMailer(RestClient restClient, String senderEmail, String senderName) {
		this.restClient = restClient;
		this.senderEmail = senderEmail;
		this.senderName = senderName;
	}

	static RestClient configure(RestClient.Builder builder, String baseUrl, String apiKey) {
		return builder.baseUrl(baseUrl).defaultHeader("api-key", apiKey).build();
	}

	private static ClientHttpRequestFactory withTimeouts() {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(TIMEOUT).build());
		factory.setReadTimeout(TIMEOUT);
		return factory;
	}

	@Override
	public void send(String to, String subject, String body) {
		Map<String, Object> message = Map.of(
				"sender", Map.of("email", senderEmail, "name", senderName),
				"to", List.of(Map.of("email", to)),
				"subject", subject,
				"textContent", body);
		try {
			restClient.post()
					.uri("/v3/smtp/email")
					.contentType(MediaType.APPLICATION_JSON)
					.body(message)
					.retrieve()
					.toBodilessEntity();
		}
		catch (RestClientException ex) {
			// The exception text can carry the response body, so keep only its type.
			throw new MailSendException("Brevo did not accept the email (" + ex.getClass().getSimpleName() + ")");
		}
	}
}
