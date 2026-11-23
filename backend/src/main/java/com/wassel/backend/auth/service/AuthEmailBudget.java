package com.wassel.backend.auth.service;

import com.wassel.backend.auth.config.AuthEmailProperties;
import com.wassel.backend.auth.entity.AuthEmail;
import com.wassel.backend.auth.entity.AuthEmailKind;
import com.wassel.backend.auth.exception.AuthEmailCapException;
import com.wassel.backend.auth.repository.AuthEmailRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * The daily cap on authentication email (SCRUM-289, docs/contracts/auth-email.md). Every method joins the caller's
 * transaction (and fails outside one), so a refused request rolls back with its row and the slot is claimed in the same
 * short transaction as the code or token, never during the send. The lock key is this class's own: the notification cap
 * uses {@code 283_001L} (NotificationDeliveryService); both caps draw on one provider quota, so a third key must be
 * a new constant, not one of these.
 */
@Slf4j
@Service
public class AuthEmailBudget {

	static final long CAP_LOCK = 289_001L;

	private final AuthEmailRepository repository;

	private final AuthEmailProperties properties;

	private final Clock clock;

	public AuthEmailBudget(AuthEmailRepository repository, AuthEmailProperties properties, Clock clock) {
		this.repository = repository;
		this.properties = properties;
		this.clock = clock;
	}

	/**
	 * Takes the cap's lock, which the surrounding transaction then holds until it ends. {@link #claim} takes it too (the
	 * lock is re-entrant); a caller that reads state the claim depends on, such as forgot-password's cooldown, takes it
	 * first, so that read cannot go stale between parallel requests.
	 */
	@Transactional(propagation = Propagation.MANDATORY)
	public void lock() {
		repository.lockForCap(CAP_LOCK);
	}

	/**
	 * Takes a slot, or throws {@link AuthEmailCapException} and takes nothing. Call it last in the caller's transaction.
	 * A refusal does not mark the transaction rollback-only: it wrote nothing, and forgot-password catches it and commits.
	 * The per-account limit counts the account's own kind of email only: sign-in codes and resends for a login, reset
	 * links for a reset. Anyone can ask for a reset link for any address, so a reset must never use up the sign-in's share.
	 */
	@Transactional(propagation = Propagation.MANDATORY, noRollbackFor = AuthEmailCapException.class)
	public void claim(UUID userId, AuthEmailKind kind) {
		lock();
		Instant start = dayStart();
		long today = repository.countByCreatedAtGreaterThanEqual(start);
		String refusedBy = null;
		if (today >= properties.dailyCap()) {
			refusedBy = "the daily cap (" + today + " of " + properties.dailyCap() + " today)";
		}
		else if (kind == AuthEmailKind.RESET_LINK) {
			long resets = repository.countByKindAndCreatedAtGreaterThanEqual(kind, start);
			if (resets >= properties.resetDailyCap()) {
				refusedBy = "the reset share (" + resets + " of " + properties.resetDailyCap() + " today)";
			}
		}
		if (refusedBy == null) {
			long own = repository.countByUserIdAndKindInAndCreatedAtGreaterThanEqual(userId, ownLimitKinds(kind), start);
			if (own >= properties.perAccountDailyCap()) {
				refusedBy = "the per-account limit (" + own + " of " + properties.perAccountDailyCap() + " today)";
			}
		}
		if (refusedBy != null) {
			log.warn("An authentication email of kind {} for user {} was refused by {}", kind, userId, refusedBy);
			throw new AuthEmailCapException(retryAfterSeconds());
		}
		insert(userId, kind);
		warnOnCrossing(today, today + 1);
	}

	/**
	 * Counts a send without checking or locking: for admin invites, which are never refused. Joins the invite's
	 * transaction, so an invite whose send fails is rolled back with its account and is not counted.
	 */
	@Transactional(propagation = Propagation.MANDATORY)
	public void record(UUID userId, AuthEmailKind kind) {
		long today = repository.countByCreatedAtGreaterThanEqual(dayStart());
		insert(userId, kind);
		warnOnCrossing(today, today + 1);
	}

	/** Seconds to the next midnight in the school's zone, at least 1. */
	public long retryAfterSeconds() {
		return Math.max(1, Duration.between(Instant.now(clock), nextDayStart()).toSeconds());
	}

	/** The kinds that count against one account's own limit. Invites are never refused, so they are not in either list. */
	private static List<AuthEmailKind> ownLimitKinds(AuthEmailKind kind) {
		return kind == AuthEmailKind.RESET_LINK ? List.of(AuthEmailKind.RESET_LINK)
				: List.of(AuthEmailKind.LOGIN_CODE, AuthEmailKind.RESEND_CODE);
	}

	private void insert(UUID userId, AuthEmailKind kind) {
		repository.save(AuthEmail.of(userId, kind, Instant.now(clock)));
	}

	/** One WARN per threshold per day (as far as parallel unlocked invites allow), whichever path moved the count. */
	private void warnOnCrossing(long before, long after) {
		long eighty = (long) Math.ceil(0.8 * properties.dailyCap());
		if (before < eighty && after >= eighty) {
			log.warn("Authentication email has reached 80% of the daily cap ({} of {})", after, properties.dailyCap());
		}
		if (before < properties.dailyCap() && after >= properties.dailyCap()) {
			log.warn("Authentication email has reached the daily cap ({} of {}): sign-ins are refused until midnight", after,
					properties.dailyCap());
		}
	}

	private Instant nextDayStart() {
		return LocalDate.now(clock).plusDays(1).atStartOfDay(clock.getZone()).toInstant();
	}

	private Instant dayStart() {
		return LocalDate.now(clock).atStartOfDay(clock.getZone()).toInstant();
	}
}
