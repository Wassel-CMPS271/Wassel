package com.wassel.backend.auth.service;

import com.wassel.backend.auth.entity.PasswordToken;
import com.wassel.backend.auth.event.PasswordSetEvent;
import com.wassel.backend.auth.exception.InvalidPasswordTokenException;
import com.wassel.backend.auth.repository.PasswordTokenRepository;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/** First-time password setting (invite) and password reset, both through an emailed single-use link. */
@Service
public class PasswordService {

	private static final Duration INVITE_LIFETIME = Duration.ofHours(24);

	private static final Duration RESET_LIFETIME = Duration.ofMinutes(30);

	private static final Duration COOLDOWN = Duration.ofSeconds(60);

	private static final SecureRandom RANDOM = new SecureRandom();

	private final PasswordTokenRepository tokenRepository;

	private final UserService userService;

	private final Mailer mailer;

	private final ApplicationEventPublisher events;

	private final String frontendBaseUrl;

	public PasswordService(PasswordTokenRepository tokenRepository, UserService userService, Mailer mailer,
			ApplicationEventPublisher events, @Value("${wassel.frontend-base-url}") String frontendBaseUrl) {
		this.tokenRepository = tokenRepository;
		this.userService = userService;
		this.mailer = mailer;
		this.events = events;
		this.frontendBaseUrl = frontendBaseUrl;
	}

	/** Emails the user a fresh link, voiding any older unused one. No cooldown: callers decide. */
	@Transactional
	public void sendInvite(User user) {
		boolean invite = !user.hasPassword();
		Instant now = Instant.now();
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

		tokenRepository.voidUnusedFor(user.getId(), now);
		tokenRepository.save(PasswordToken.builder()
				.userId(user.getId())
				.tokenHash(hash(token))
				.expiresAt(now.plus(invite ? INVITE_LIFETIME : RESET_LIFETIME))
				.build());

		String link = "%s/%s?token=%s".formatted(frontendBaseUrl, invite ? "set-password" : "reset-password", token);
		mailer.send(user.getEmail(), invite ? "Set your Wassel password" : "Reset your Wassel password",
				"%s\n\n%s\n\nThis link expires in %s and can be used once."
						.formatted(invite ? "You've been invited to Wassel. Set your password here:"
								: "Reset your Wassel password here:", link, invite ? "24 hours" : "30 minutes"));
	}

	/** Silent for unknown or disabled accounts and during the cooldown, so it reveals nothing. */
	@Transactional
	public void forgotPassword(String email) {
		userService.findByEmail(email)
				.filter(User::isEnabled)
				.filter(user -> tokenRepository.findFirstByUserIdOrderByCreatedAtDesc(user.getId())
						.map(last -> last.getCreatedAt().isBefore(Instant.now().minus(COOLDOWN)))
						.orElse(true))
				.ifPresent(this::sendInvite);
	}

	@Transactional
	public void setPassword(String token, String newPassword) {
		Instant now = Instant.now();
		PasswordToken stored = tokenRepository.findByTokenHash(hash(token))
				.filter(candidate -> candidate.getUsedAt() == null && candidate.getExpiresAt().isAfter(now))
				.orElseThrow(InvalidPasswordTokenException::new);
		User user = userService.findById(stored.getUserId())
				.filter(User::isEnabled)
				.orElseThrow(InvalidPasswordTokenException::new);
		if (tokenRepository.markUsed(stored.getId(), now) == 0) {
			throw new InvalidPasswordTokenException();
		}

		userService.setPassword(user.getId(), newPassword);
		tokenRepository.voidUnusedFor(user.getId(), now);
		events.publishEvent(new PasswordSetEvent(user.getId()));
	}

	private static String hash(String token) {
		try {
			return HexFormat.of().formatHex(
					MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}
}
