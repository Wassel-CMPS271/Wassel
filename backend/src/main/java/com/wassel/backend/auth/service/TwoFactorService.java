package com.wassel.backend.auth.service;

import com.wassel.backend.auth.entity.AuthEmailKind;
import com.wassel.backend.auth.entity.LoginCode;
import com.wassel.backend.auth.exception.AuthEmailSendException;
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
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

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

	private final AuthEmailBudget budget;

	private final TransactionTemplate transactions;

	public TwoFactorService(LoginCodeRepository codeRepository, UserService userService, Mailer mailer,
			AuthEmailBudget budget, TransactionTemplate transactions) {
		this.codeRepository = codeRepository;
		this.userService = userService;
		this.mailer = mailer;
		this.budget = budget;
		this.transactions = transactions;
	}

	/**
	 * Emails a code and returns the pending token that the verify step must present. Deliberately not
	 * {@code @Transactional} (SCRUM-289, docs/contracts/auth-email.md): the code and the cap's slot are one short
	 * transaction, and the send comes after it has committed, so no connection is held while the provider is called.
	 * A failed send deletes the row this request made, so the user can sign in again at once.
	 */
	public String start(User user) {
		Instant now = Instant.now();
		Instant cutoff = now.minus(COOLDOWN);
		String pendingToken = PasswordService.randomToken();
		String code = newCode();
		String codeHash = PasswordService.hash(code);
		UUID rowId = transactions.execute(status -> {
			codeRepository.findByUserId(user.getId())
					.filter(last -> last.getUsedAt() == null && last.getSentAt().isAfter(cutoff))
					.ifPresent(last -> {
						throw new CodeCooldownException();
					});
			codeRepository.deleteReplaceable(user.getId(), cutoff);
			LoginCode saved;
			try {
				saved = codeRepository.saveAndFlush(LoginCode.builder()
						.userId(user.getId())
						.pendingHash(PasswordService.hash(pendingToken))
						.codeHash(codeHash)
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
			// After the flush, so a request that lost the race above takes no slot and sends nothing.
			budget.claim(user.getId(), AuthEmailKind.LOGIN_CODE);
			return saved.getId();
		});
		try {
			sendCode(user, code);
		}
		catch (RuntimeException ex) {
			SendUndo.run(transactions, () -> codeRepository.deleteUnsent(rowId, codeHash), AuthEmailKind.LOGIN_CODE,
					user.getId());
			throw new AuthEmailSendException(AuthEmailKind.LOGIN_CODE, user.getId(), ex);
		}
		return pendingToken;
	}

	/**
	 * Replaces the code with a fresh one, with fresh attempts. Once a minute at most. Not {@code @Transactional}, for the
	 * reason {@link #start} gives; a failed send puts the previous code back (it works if it has not expired by then), and resend is allowed at once.
	 */
	public void resend(String pendingToken) {
		Instant now = Instant.now();
		String code = newCode();
		String codeHash = PasswordService.hash(code);
		record PriorCode(User user, UUID rowId, String oldHash, Instant oldExpiresAt, Instant oldSentAt, int oldAttempts) {
		}
		PriorCode prior = transactions.execute(status -> {
			LoginCode stored = findLive(pendingToken, now);
			User user = userService.findById(stored.getUserId())
					.filter(User::isEnabled)
					.orElseThrow(LoginExpiredException::new);
			Instant cutoff = now.minus(COOLDOWN);
			if (stored.getSentAt().isAfter(cutoff)) {
				throw new CodeCooldownException();
			}
			PriorCode before = new PriorCode(user, stored.getId(), stored.getCodeHash(), stored.getExpiresAt(),
					stored.getSentAt(), stored.getAttempts());
			// One conditional update, not load-and-save: parallel resends would all pass the check above,
			// each would reset the attempts, and a save could write back a row that verify just used.
			if (codeRepository.reissue(stored.getId(), codeHash, now.plus(CODE_LIFETIME), now, cutoff, MAX_ATTEMPTS) == 0) {
				throw new CodeCooldownException();
			}
			budget.claim(user.getId(), AuthEmailKind.RESEND_CODE);
			return before;
		});
		try {
			sendCode(prior.user(), code);
		}
		catch (RuntimeException ex) {
			SendUndo.run(transactions, () -> codeRepository.restore(prior.rowId(), codeHash, prior.oldHash(),
					prior.oldExpiresAt(), prior.oldSentAt(), prior.oldAttempts()), AuthEmailKind.RESEND_CODE,
					prior.user().getId());
			throw new AuthEmailSendException(AuthEmailKind.RESEND_CODE, prior.user().getId(), ex);
		}
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
