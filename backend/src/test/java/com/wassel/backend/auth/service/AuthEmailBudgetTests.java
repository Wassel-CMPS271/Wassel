package com.wassel.backend.auth.service;

import com.wassel.backend.auth.entity.AuthEmail;
import com.wassel.backend.auth.entity.AuthEmailKind;
import com.wassel.backend.auth.exception.AuthEmailCapException;
import com.wassel.backend.auth.repository.AuthEmailRepository;
import com.wassel.backend.common.MondayClockConfig;
import com.wassel.backend.common.MutableClock;
import com.wassel.backend.common.Parallel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-289, "The daily cap" in docs/contracts/auth-email.md, with the caps set to 3 (all kinds), 2 (reset links) and 2
 * (one account). Its own class because the properties make one more Spring context (see backend/CLAUDE.md, Tests).
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(MondayClockConfig.class)
@ExtendWith(OutputCaptureExtension.class)
@TestPropertySource(properties = { "wassel.auth.email.daily-cap=3", "wassel.auth.email.reset-daily-cap=2",
		"wassel.auth.email.per-account-daily-cap=2" })
class AuthEmailBudgetTests {

	/** 23:59:59 on Monday 2026-11-02 in Beirut (UTC+2). */
	private static final Instant ONE_SECOND_BEFORE_MIDNIGHT = Instant.parse("2026-11-02T21:59:59Z");

	@Autowired
	private AuthEmailBudget budget;

	@Autowired
	private AuthEmailRepository repository;

	@Autowired
	private TransactionTemplate transactions;

	@Autowired
	private MutableClock clock;

	@BeforeEach
	void anEmptyDay() {
		clock.set(MondayClockConfig.MONDAY);
		repository.deleteAll();
	}

	private void claim(UUID user, AuthEmailKind kind) {
		transactions.executeWithoutResult(status -> budget.claim(user, kind));
	}

	private int claimedStatus(UUID user, AuthEmailKind kind) {
		try {
			claim(user, kind);
			return 200;
		}
		catch (AuthEmailCapException e) {
			return 503;
		}
	}

	private void claimThreeLogins() {
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);
	}

	@Test
	void theDailyCapRefusesOnceReachedAndARefusedClaimWritesNoRow() {
		claimThreeLogins();

		assertThrows(AuthEmailCapException.class, () -> claim(UUID.randomUUID(), AuthEmailKind.RESEND_CODE));

		assertEquals(3, repository.count());
	}

	@Test
	void theResetShareRefusesResetLinksButStillAllowsASignInUnderTheDailyCap() {
		claim(UUID.randomUUID(), AuthEmailKind.RESET_LINK);
		claim(UUID.randomUUID(), AuthEmailKind.RESET_LINK);

		assertThrows(AuthEmailCapException.class, () -> claim(UUID.randomUUID(), AuthEmailKind.RESET_LINK));
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);

		assertEquals(3, repository.count());
	}

	@Test
	void thePerAccountLimitRefusesOneUserAndNotAnother() {
		UUID busy = UUID.randomUUID();
		claim(busy, AuthEmailKind.LOGIN_CODE);
		claim(busy, AuthEmailKind.RESEND_CODE);

		assertThrows(AuthEmailCapException.class, () -> claim(busy, AuthEmailKind.RESEND_CODE));
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);
	}

	@Test
	void resetLinksNeverUseUpASignInsPerAccountLimit() {
		UUID victim = UUID.randomUUID();
		claim(victim, AuthEmailKind.RESET_LINK);
		claim(victim, AuthEmailKind.RESET_LINK);

		claim(victim, AuthEmailKind.LOGIN_CODE);

		assertEquals(3, repository.count());
	}

	@Test
	void invitesNeverUseUpASignInsPerAccountLimit() {
		UUID invited = UUID.randomUUID();
		transactions.executeWithoutResult(status -> budget.record(invited, AuthEmailKind.INVITE_LINK));
		transactions.executeWithoutResult(status -> budget.record(invited, AuthEmailKind.INVITE_LINK));

		claim(invited, AuthEmailKind.LOGIN_CODE);

		assertEquals(3, repository.count());
	}

	@Test
	void signInsNeverUseUpAnAccountsOwnResetLimit() {
		UUID user = UUID.randomUUID();
		claim(user, AuthEmailKind.LOGIN_CODE);
		claim(user, AuthEmailKind.RESEND_CODE);

		claim(user, AuthEmailKind.RESET_LINK);

		assertEquals(3, repository.count());
	}

	@Test
	void anAccountsResetsAreRefusedAtThePerAccountLimit() {
		UUID user = UUID.randomUUID();
		claim(user, AuthEmailKind.RESET_LINK);
		claim(user, AuthEmailKind.RESET_LINK);

		assertThrows(AuthEmailCapException.class, () -> claim(user, AuthEmailKind.RESET_LINK));
		assertEquals(2, repository.count());
	}

	@Test
	void parallelClaimsForOneAccountStopAtThePerAccountLimit() throws Exception {
		UUID busy = UUID.randomUUID();
		Callable<Integer> claim = () -> claimedStatus(busy, AuthEmailKind.LOGIN_CODE);

		List<Integer> answers = Parallel.inParallel(List.of(claim, claim, claim, claim, claim, claim));

		assertEquals(2, answers.stream().filter(status -> status == 200).count(), answers.toString());
		assertEquals(2, repository.count());
	}

	@Test
	void parallelResetsStopAtTheResetShare() throws Exception {
		List<Callable<Integer>> resets = new java.util.ArrayList<>();
		for (int i = 0; i < 6; i++) {
			resets.add(() -> claimedStatus(UUID.randomUUID(), AuthEmailKind.RESET_LINK));
		}

		List<Integer> answers = Parallel.inParallel(resets);

		assertEquals(2, answers.stream().filter(status -> status == 200).count(), answers.toString());
		assertEquals(2, repository.count());
	}

	@Test
	void anInviteIsNeverRefusedAndCountsTowardsTheNextClaim() {
		UUID admin = UUID.randomUUID();
		for (int i = 0; i < 5; i++) {
			transactions.executeWithoutResult(status -> budget.record(admin, AuthEmailKind.INVITE_LINK));
		}

		assertEquals(5, repository.count());
		assertThrows(AuthEmailCapException.class, () -> claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE));
	}

	@Test
	void aNewBeirutDayStartsTheCountOver() {
		clock.set(ONE_SECOND_BEFORE_MIDNIGHT);
		claimThreeLogins();
		assertThrows(AuthEmailCapException.class, () -> claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE));

		clock.set(ONE_SECOND_BEFORE_MIDNIGHT.plusSeconds(2));
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);

		assertEquals(4, repository.count());
	}

	@Test
	void retryAfterIsTheSecondsToTheNextBeirutMidnight() {
		clock.set(ONE_SECOND_BEFORE_MIDNIGHT.minusSeconds(29));
		assertEquals(30, budget.retryAfterSeconds());

		clock.set(ONE_SECOND_BEFORE_MIDNIGHT.plusSeconds(1).minusMillis(1));
		assertEquals(1, budget.retryAfterSeconds(), "never less than one second");
	}

	@Test
	void aRefusalCarriesTheSecondsToMidnight() {
		clock.set(ONE_SECOND_BEFORE_MIDNIGHT.minusSeconds(29));
		claimThreeLogins();

		AuthEmailCapException refused = assertThrows(AuthEmailCapException.class,
				() -> claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE));

		assertEquals(30, refused.getRetryAfterSeconds());
	}

	@Test
	void twoClaimsForTheLastSlotAtTheSameInstantGiveItToExactlyOne() throws Exception {
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);
		Callable<Integer> contender = () -> claimedStatus(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);

		List<Integer> answers = Parallel.inParallel(List.of(contender, contender));

		assertEquals(1, answers.stream().filter(status -> status == 200).count(), answers.toString());
		assertEquals(3, repository.count());
	}

	@Test
	void aClaimOutsideATransactionFailsInsteadOfTakingASlotThatCannotBeRolledBack() {
		assertThrows(IllegalTransactionStateException.class,
				() -> budget.claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE));
		assertEquals(0, repository.count());
	}

	@Test
	void theLogHoldsIdsKindsAndCountsOnly(CapturedOutput output) {
		UUID user = UUID.randomUUID();
		claimThreeLogins();
		assertTrue(output.getAll().contains("80% of the daily cap (3 of 3)"), "the warning when the count reaches 80%");

		assertThrows(AuthEmailCapException.class, () -> claim(user, AuthEmailKind.RESET_LINK));

		assertTrue(output.getAll().contains("kind RESET_LINK for user " + user + " was refused by the daily cap (3 of 3 today)"));
		assertFalse(output.getAll().contains("@wassel.test"), "no address in the log");
	}

	@Test
	void aClaimAtExactlyBeirutMidnightBelongsToTheNewDay() {
		clock.set(Instant.parse("2026-11-02T21:59:59.999Z"));
		claimThreeLogins();
		assertThrows(AuthEmailCapException.class, () -> claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE));

		clock.set(Instant.parse("2026-11-02T22:00:00Z"));
		assertEquals(86_400, budget.retryAfterSeconds());
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);

		assertEquals(4, repository.count());
	}

	@Test
	void theDayThatStartsAtOneAmWhenBeirutSpringsForwardIsStillOneDay() {
		// Lebanon moves its clocks from 00:00 to 01:00 on the last Sunday of March, so 2027-03-28 has no midnight:
		// its first instant is 01:00 (UTC+3), which is 22:00Z on the 27th.
		clock.set(Instant.parse("2027-03-27T21:59:59Z"));
		claimThreeLogins();
		assertThrows(AuthEmailCapException.class, () -> claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE));
		assertEquals(1, budget.retryAfterSeconds());

		clock.set(Instant.parse("2027-03-27T22:00:00Z"));
		claim(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE);
		clock.set(Instant.parse("2027-03-28T05:00:00Z"));
		assertEquals(16 * 3600, budget.retryAfterSeconds(), "08:00 at UTC+3 to the next midnight at UTC+3");

		assertEquals(4, repository.count());
	}

	@Test
	void aRefusalNamesTheLimitThatRefused(CapturedOutput output) {
		UUID busy = UUID.randomUUID();
		claim(busy, AuthEmailKind.LOGIN_CODE);
		claim(busy, AuthEmailKind.RESEND_CODE);
		assertThrows(AuthEmailCapException.class, () -> claim(busy, AuthEmailKind.RESEND_CODE));
		assertTrue(output.getAll().contains("kind RESEND_CODE for user " + busy
				+ " was refused by the per-account limit (2 of 2 today)"));

		repository.deleteAll();
		claim(UUID.randomUUID(), AuthEmailKind.RESET_LINK);
		claim(UUID.randomUUID(), AuthEmailKind.RESET_LINK);
		UUID refused = UUID.randomUUID();
		assertThrows(AuthEmailCapException.class, () -> claim(refused, AuthEmailKind.RESET_LINK));
		assertTrue(output.getAll().contains("kind RESET_LINK for user " + refused
				+ " was refused by the reset share (2 of 2 today)"));
	}

	@Test
	void invitesThatCarryTheDayPast80And100PercentWarnOncePerThreshold(CapturedOutput output) {
		UUID admin = UUID.randomUUID();
		for (int i = 0; i < 5; i++) {
			transactions.executeWithoutResult(status -> budget.record(admin, AuthEmailKind.INVITE_LINK));
		}

		String log = output.getAll();
		assertEquals(1, log.split("has reached 80% of the daily cap", -1).length - 1, "one 80% line");
		assertEquals(1, log.split("has reached the daily cap \\(3 of 3\\)", -1).length - 1,
				"one line for the cap itself, not one per invite");
	}

	@Test
	void anAuthEmailRowNeedsAUserAKindAndATime() {
		assertThrows(NullPointerException.class, () -> AuthEmail.of(null, AuthEmailKind.LOGIN_CODE, Instant.now()));
		assertThrows(NullPointerException.class, () -> AuthEmail.of(UUID.randomUUID(), null, Instant.now()));
		assertThrows(NullPointerException.class, () -> AuthEmail.of(UUID.randomUUID(), AuthEmailKind.LOGIN_CODE, null));
	}
}
