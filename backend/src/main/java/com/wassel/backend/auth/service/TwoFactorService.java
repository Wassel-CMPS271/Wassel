package com.wassel.backend.auth.service;

import com.wassel.backend.auth.entity.LoginCode;
import com.wassel.backend.auth.exception.CodeCooldownException;
import com.wassel.backend.auth.exception.InvalidCodeException;
import com.wassel.backend.auth.exception.LoginExpiredException;
import com.wassel.backend.auth.repository.LoginCodeRepository;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/** The emailed one-time code that completes a login after the password step. */
@Slf4j
@Service
public class TwoFactorService {

	private static final Duration CODE_LIFETIME = Duration.ofMinutes(5);

	/** How long after the password step the code step stays open. The pending cookie lives exactly as long. */
	public static final Duration PENDING_LIFETIME = Duration.ofMinutes(15);

	private static final Duration COOLDOWN = Duration.ofSeconds(60);

	private static final int MAX_ATTEMPTS = 5;

	private static final SecureRandom RANDOM = new SecureRandom();

	private final LoginCodeRepository codeRepository;

	private final UserService userService;

	private final Mailer mailer;

	public TwoFactorService(LoginCodeRepository codeRepository, UserService userService, Mailer mailer) {
		this.codeRepository = codeRepository;
		this.userService = userService;
		this.mailer = mailer;
	}

	/** Emails a code and returns the pending token that the verify step must present. */
	@Transactional
	public String start(User user) {
		Instant now = Instant.now();
		codeRepository.findByUserId(user.getId())
				.filter(last -> last.getUsedAt() == null && last.getSentAt().isAfter(now.minus(COOLDOWN)))
				.ifPresent(last -> {
					throw new CodeCooldownException();
				});

		String pendingToken = PasswordService.randomToken();
		String code = newCode();
		codeRepository.deleteForUser(user.getId());
		try {
			codeRepository.saveAndFlush(LoginCode.builder()
					.userId(user.getId())
					.pendingHash(PasswordService.hash(pendingToken))
					.codeHash(PasswordService.hash(code))
					.expiresAt(now.plus(CODE_LIFETIME))
					.sentAt(now)
					.build());
		}
		catch (DataIntegrityViolationException ex) {
			// Parallel logins for one user: the unique user_id is the backstop for the cooldown check above.
			// Logged with its cause so any other constraint failure can't hide behind "wait a minute".
			log.warn("Login code for user {} not stored: {}", user.getId(), ex.getMostSpecificCause().getMessage());
			throw new CodeCooldownException();
		}
		// After the flush, so a request that lost the race above sends nothing.
		sendCode(user, code);
		return pendingToken;
	}

	/** Replaces the code with a fresh one, with fresh attempts. Once a minute at most. */
	@Transactional
	public void resend(String pendingToken) {
		Instant now = Instant.now();
		LoginCode stored = findLive(pendingToken, now);
		User user = userService.findById(stored.getUserId())
				.filter(User::isEnabled)
				.orElseThrow(LoginExpiredException::new);
		Instant cutoff = now.minus(COOLDOWN);
		if (stored.getSentAt().isAfter(cutoff)) {
			throw new CodeCooldownException();
		}

		String code = newCode();
		// One conditional update, not load-and-save: parallel resends would all pass the check above,
		// each would reset the attempts, and a save could write back a row that verify just used.
		if (codeRepository.reissue(stored.getId(), PasswordService.hash(code), now.plus(CODE_LIFETIME), now, cutoff,
				MAX_ATTEMPTS) == 0) {
			throw new CodeCooldownException();
		}
		sendCode(user, code);
	}

	// The attempt is counted by an update that must survive the exception thrown for a wrong code,
	// so those exceptions must not roll the transaction back, or the limit would never trigger.
	@Transactional(noRollbackFor = { InvalidCodeException.class, LoginExpiredException.class })
	public User verify(String pendingToken, String code) {
		Instant now = Instant.now();
		LoginCode stored = findLive(pendingToken, now);
		if (codeRepository.recordAttempt(stored.getId(), MAX_ATTEMPTS) == 0) {
			log.warn("Login code for user {} was used or ran out of attempts in a parallel request", stored.getUserId());
			throw new LoginExpiredException();
		}

		boolean matches = MessageDigest.isEqual(
				PasswordService.hash(code == null ? "" : code).getBytes(StandardCharsets.UTF_8),
				stored.getCodeHash().getBytes(StandardCharsets.UTF_8));
		if (!matches || !stored.getExpiresAt().isAfter(now)) {
			// The line the exception handler logs names no user; this one shows whose code is being guessed.
			int attempt = stored.getAttempts() + 1;
			log.warn("Wrong or expired login code for user {} (attempt {} of {})", stored.getUserId(), attempt,
					MAX_ATTEMPTS);
			throw attempt >= MAX_ATTEMPTS ? new LoginExpiredException() : new InvalidCodeException();
		}
		if (codeRepository.markUsed(stored.getId(), now) == 0) {
			throw new LoginExpiredException();
		}
		return userService.findById(stored.getUserId())
				.filter(User::isEnabled)
				.orElseThrow(LoginExpiredException::new);
	}

	/** The pending login behind this token, if it is still open: not used, not out of attempts, not too old. */
	private LoginCode findLive(String pendingToken, Instant now) {
		return Optional.ofNullable(pendingToken)
				.flatMap(token -> codeRepository.findByPendingHash(PasswordService.hash(token)))
				.filter(candidate -> candidate.getUsedAt() == null && candidate.getAttempts() < MAX_ATTEMPTS
						&& candidate.getCreatedAt().isAfter(now.minus(PENDING_LIFETIME)))
				.orElseThrow(LoginExpiredException::new);
	}

	private static String newCode() {
		return "%06d".formatted(RANDOM.nextInt(1_000_000));
	}

	private void sendCode(User user, String code) {
		mailer.send(user.getEmail(), "Your Wassel verification code",
				"Your verification code is %s. It expires in 5 minutes. If you didn't try to sign in, change your password."
						.formatted(code));
	}
}
