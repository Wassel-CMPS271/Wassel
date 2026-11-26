package com.wassel.backend.auth.service;

import com.wassel.backend.auth.entity.AuthEmailKind;
import com.wassel.backend.auth.entity.PasswordToken;
import com.wassel.backend.auth.event.PasswordSetEvent;
import com.wassel.backend.auth.exception.AuthEmailCapException;
import com.wassel.backend.auth.exception.AuthEmailSendException;
import com.wassel.backend.auth.exception.InvalidPasswordTokenException;
import com.wassel.backend.auth.repository.PasswordTokenRepository;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

/** First-time password setting (invite) and password reset, both through an emailed single-use link. */
@Slf4j
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

	private final AuthEmailBudget budget;

	private final TransactionTemplate transactions;

	public PasswordService(PasswordTokenRepository tokenRepository, UserService userService, Mailer mailer,
			ApplicationEventPublisher events, @Value("${wassel.frontend-base-url}") String frontendBaseUrl,
			AuthEmailBudget budget, TransactionTemplate transactions) {
		this.tokenRepository = tokenRepository;
		this.userService = userService;
		this.mailer = mailer;
		this.events = events;
		this.frontendBaseUrl = frontendBaseUrl;
		this.budget = budget;
		this.transactions = transactions;
	}

	/** A stored token and the email that carries it, for the send that comes after the transaction. */
	private record Link(UUID tokenId, UUID slot, User user, String subject, String body) {

		/** Not the generated one: the body holds the raw token, which must never reach a log. */
		@Override
		public String toString() {
			return "Link[tokenId=" + tokenId + ", userId=" + user.getId() + "]";
		}
	}

	/**
	 * Emails the user a fresh link, voiding any older unused one. No cooldown: callers decide. For admin invites: it
	 * sends inside the caller's transaction (a failed send rolls the account back, and the cap's row with it), and counts
	 * towards the cap without ever being refused by it.
	 */
	@Transactional
	public void sendInvite(User user) {
		budget.record(user.getId(), AuthEmailKind.INVITE_LINK);
		Link link = issueLink(user, null);
		tokenRepository.voidUnusedExcept(user.getId(), link.tokenId(), Instant.now());
		try {
			mailer.send(user.getEmail(), link.subject(), link.body());
		}
		catch (RuntimeException ex) {
			// Rolls the transaction back. The provider's message can hold the address, so it is not carried on.
			throw new AuthEmailSendException(AuthEmailKind.INVITE_LINK, user.getId(), ex);
		}
	}

	/**
	 * Silent for unknown or disabled accounts, during the cooldown, over the daily cap and when the send fails, so it
	 * reveals nothing. Not {@code @Transactional} (SCRUM-289, docs/contracts/auth-email.md): the token and the cap's
	 * slot are one short transaction, the send follows its commit, and a failed send deletes the token. The user's
	 * older links are voided only after the send succeeded, so a failed send leaves the link they already had.
	 */
	public void forgotPassword(String email) {
		Link link = transactions.execute(status -> startReset(email));
		if (link == null) {
			return;
		}
		try {
			mailer.send(link.user().getEmail(), link.subject(), link.body());
		}
		catch (RuntimeException ex) {
			// Answered 204 like every other outcome; this line is the only trace, and never holds the address or text.
			log.error("The reset link for user {} was not sent ({})", link.user().getId(), ex.getClass().getSimpleName());
			SendUndo.run(transactions, () -> {
				int removed = tokenRepository.deleteUnused(link.tokenId());
				budget.refund(link.slot());
				return removed;
			}, AuthEmailKind.RESET_LINK, link.user().getId());
			return;
		}
		try {
			transactions.executeWithoutResult(status -> tokenRepository.voidUnusedExcept(link.user().getId(),
					link.tokenId(), Instant.now()));
		}
		catch (RuntimeException ex) {
			log.error("The older links of user {} could not be voided after the reset link was sent ({}): they work "
					+ "until they expire", link.user().getId(), ex.getClass().getSimpleName());
		}
	}

	/** The first transaction of a reset: the token and the cap's slot, or nothing (null). */
	private Link startReset(String email) {
		Optional<User> user = userService.findByEmail(email).filter(User::isEnabled);
		if (user.isEmpty()) {
			return null;
		}
		// The cooldown is read under the cap's lock. Read before it, parallel requests all pass it (each sees no token
		// yet), so one address could be mailed up to the per-account limit in a second.
		budget.lock();
		boolean coolingDown = tokenRepository.findFirstByUserIdOrderByCreatedAtDesc(user.get().getId())
				.map(last -> !last.getCreatedAt().isBefore(Instant.now().minus(COOLDOWN)))
				.orElse(false);
		if (coolingDown) {
			return null;
		}
		UUID slot;
		try {
			slot = budget.claim(user.get().getId(), AuthEmailKind.RESET_LINK);
		}
		catch (AuthEmailCapException ex) {
			return null;
		}
		return issueLink(user.get(), slot);
	}

	/** Stores a new link token for the user. Joins the caller's transaction, and voids nothing. {@code slot} is the cap's, or null for an invite. */
	private Link issueLink(User user, UUID slot) {
		boolean invite = !user.hasPassword();
		Instant now = Instant.now();
		String token = randomToken();

		PasswordToken saved = tokenRepository.save(PasswordToken.builder()
				.userId(user.getId())
				.tokenHash(hash(token))
				.expiresAt(now.plus(invite ? INVITE_LIFETIME : RESET_LIFETIME))
				.build());

		String link = "%s/%s?token=%s".formatted(frontendBaseUrl, invite ? "set-password" : "reset-password", token);
		return new Link(saved.getId(), slot, user, invite ? "Set your Wassel password" : "Reset your Wassel password",
				"%s\n\n%s\n\nThis link expires in %s and can be used once."
						.formatted(invite ? "You've been invited to Wassel. Set your password here:"
								: "Reset your Wassel password here:", link, invite ? "24 hours" : "30 minutes"));
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

	static String randomToken() {
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	static String hash(String token) {
		try {
			return HexFormat.of().formatHex(
					MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}
}
