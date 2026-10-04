package com.wassel.backend.auth.service;

import com.wassel.backend.auth.entity.LoginCode;
import com.wassel.backend.auth.exception.CodeCooldownException;
import com.wassel.backend.auth.exception.InvalidCodeException;
import com.wassel.backend.auth.exception.LoginExpiredException;
import com.wassel.backend.auth.repository.LoginCodeRepository;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
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
@Service
public class TwoFactorService {

	private static final Duration CODE_LIFETIME = Duration.ofMinutes(5);

	private static final Duration PENDING_LIFETIME = Duration.ofMinutes(15);

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
		String code = "%06d".formatted(RANDOM.nextInt(1_000_000));
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
			throw new CodeCooldownException();
		}
		// After the flush, so a request that lost the race above sends nothing.
		mailer.send(user.getEmail(), "Your Wassel verification code",
				"Your verification code is %s. It expires in 5 minutes. If you didn't try to sign in, change your password."
						.formatted(code));
		return pendingToken;
	}

	// The attempt is counted by an update that must survive the exception thrown for a wrong code,
	// so those exceptions must not roll the transaction back, or the limit would never trigger.
	@Transactional(noRollbackFor = { InvalidCodeException.class, LoginExpiredException.class })
	public User verify(String pendingToken, String code) {
		Instant now = Instant.now();
		LoginCode stored = Optional.ofNullable(pendingToken)
				.flatMap(token -> codeRepository.findByPendingHash(PasswordService.hash(token)))
				.filter(candidate -> candidate.getUsedAt() == null && candidate.getAttempts() < MAX_ATTEMPTS
						&& candidate.getCreatedAt().isAfter(now.minus(PENDING_LIFETIME)))
				.orElseThrow(LoginExpiredException::new);
		if (codeRepository.recordAttempt(stored.getId(), MAX_ATTEMPTS) == 0) {
			throw new LoginExpiredException();
		}

		boolean matches = MessageDigest.isEqual(
				PasswordService.hash(code == null ? "" : code).getBytes(StandardCharsets.UTF_8),
				stored.getCodeHash().getBytes(StandardCharsets.UTF_8));
		if (!matches || !stored.getExpiresAt().isAfter(now)) {
			throw stored.getAttempts() + 1 >= MAX_ATTEMPTS ? new LoginExpiredException() : new InvalidCodeException();
		}
		if (codeRepository.markUsed(stored.getId(), now) == 0) {
			throw new LoginExpiredException();
		}
		return userService.findById(stored.getUserId())
				.filter(User::isEnabled)
				.orElseThrow(LoginExpiredException::new);
	}
}
