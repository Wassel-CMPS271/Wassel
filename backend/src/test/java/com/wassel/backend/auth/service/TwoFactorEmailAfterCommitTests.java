package com.wassel.backend.auth.service;

import com.wassel.backend.auth.support.AuthEmailSupport;
import com.wassel.backend.common.Parallel;
import com.wassel.backend.users.entity.User;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-289, "Where the send happens" in docs/contracts/auth-email.md for sign-in and resend: a failed send leaves no code
 * the user never received and never blocks the next try. The provider is a {@link com.wassel.backend.inbox.service.RecordingMailer}.
 */
@ExtendWith(OutputCaptureExtension.class)
class TwoFactorEmailAfterCommitTests extends AuthEmailSupport {

	/**
	 * Runs {@code during} once, inside the provider's first call, then makes that call fail. The nested request is
	 * accepted by the provider (it runs with refusals off), and the outer one is refused after it returns.
	 */
	private void failTheFirstSendAfter(Runnable during) {
		AtomicBoolean first = new AtomicBoolean(true);
		mailer.whileSending(() -> {
			if (first.getAndSet(false)) {
				mailer.refuseAll(false);
				during.run();
				mailer.refuseAll(true);
			}
		});
		mailer.refuseAll(true);
	}

	private MvcResult loginUnchecked(User user) {
		try {
			return login(user);
		}
		catch (Exception e) {
			throw new AssertionError(e);
		}
	}

	private MvcResult resendUnchecked(Cookie pending) {
		try {
			return resend(pending);
		}
		catch (Exception e) {
			throw new AssertionError(e);
		}
	}

	@Test
	void aFailedLoginSendIsA500LeavesNoCodeAndTheNextLoginAtOnceGetsOne() throws Exception {
		User user = saveUser();
		mailer.refuseNext(1);

		assertEquals(500, login(user).getResponse().getStatus());
		assertEquals(0, codeRows(user), "no code the user never received");

		assertEquals(204, login(user).getResponse().getStatus(), "no cooldown for a code that was never sent");
		assertEquals(1, mailer.sent().size());
	}

	@Test
	void aFailedLoginSendNeverDeletesTheRowOfALoginThatReplacedItDuringTheSend() throws Exception {
		User user = saveUser();
		AtomicReference<MvcResult> newer = new AtomicReference<>();
		failTheFirstSendAfter(() -> {
			ageCode(user);
			newer.set(loginUnchecked(user));
		});

		assertEquals(500, login(user).getResponse().getStatus());

		assertEquals(204, newer.get().getResponse().getStatus());
		assertEquals(1, codeRows(user), "the newer login's row is still there");
		assertEquals(200, verifyCode(pendingCookie(newer.get()), lastCode()).getResponse().getStatus());
	}

	@Test
	void aFailedLoginSendNeverDeletesARowThatWasUsedDuringTheSend() throws Exception {
		User user = saveUser();
		mailer.refuseNext(1);
		mailer.whileSending(() -> jdbc.update("update login_codes set used_at = now() where user_id = ?", user.getId()));

		assertEquals(500, login(user).getResponse().getStatus());

		assertEquals(1, codeRows(user), "a used code is not an unsent one");
	}

	@Test
	void parallelLoginsForOneAccountSendOneCodeAndTakeOneSlot() throws Exception {
		for (int round = 0; round < 5; round++) {
			User user = saveUser();
			Callable<Integer> attempt = () -> login(user).getResponse().getStatus();
			int sentBefore = mailer.sent().size();

			List<Integer> answers = Parallel.inParallel(List.of(attempt, attempt, attempt, attempt));

			assertEquals(1, answers.stream().filter(status -> status == 204).count(), answers.toString());
			assertEquals(1, codeRows(user));
			assertEquals(1, authEmailRows(user, "LOGIN_CODE"), "a login that lost the race took no slot");
			assertEquals(1, mailer.sent().size() - sentBefore, "and sent nothing");
		}
	}

	@Test
	void resendIsAllowedAtOnceAfterAFailedOne() throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login(user));
		ageCode(user);
		mailer.refuseNext(1);

		assertEquals(500, resend(pending).getResponse().getStatus());

		assertEquals(204, resend(pending).getResponse().getStatus(), "the cooldown does not see the failed one");
	}

	@Test
	void theCodeTheUserLastReceivedVerifiesAfterAFailedResend() throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login(user));
		String received = lastCode();
		ageCode(user);
		mailer.refuseNext(1);
		assertEquals(500, resend(pending).getResponse().getStatus());

		assertEquals(200, verifyCode(pending, received).getResponse().getStatus());
	}

	@Test
	void aFailedResendNeverOverwritesTheCodeOfASecondResendThatLandedDuringItsSend() throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login(user));
		ageCode(user);
		AtomicReference<MvcResult> second = new AtomicReference<>();
		failTheFirstSendAfter(() -> {
			ageCode(user);
			second.set(resendUnchecked(pending));
		});

		assertEquals(500, resend(pending).getResponse().getStatus());

		assertEquals(204, second.get().getResponse().getStatus());
		assertEquals(200, verifyCode(pending, lastCode()).getResponse().getStatus(),
				"the second resend's code still works: the first one's undo matched nothing");
	}

	@Test
	void aFailedResendNeverUnUsesACodeThatWasUsedDuringItsSend() throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login(user));
		ageCode(user);
		mailer.refuseNext(1);
		mailer.whileSending(() -> jdbc.update("update login_codes set used_at = now() where user_id = ?", user.getId()));

		assertEquals(500, resend(pending).getResponse().getStatus());

		assertEquals(1, jdbc.queryForObject("select count(*) from login_codes where user_id = ? and used_at is not null",
				Integer.class, user.getId()), "the code that was used stays used");
	}

	@Test
	void guessesAtEitherCodeStillCountAfterAFailedResend() throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login(user));
		String received = lastCode();
		String wrong = received.equals("000000") ? "000001" : "000000";
		assertEquals(400, verifyCode(pending, wrong).getResponse().getStatus());
		ageCode(user);
		mailer.refuseNext(1);
		// Two wrong guesses at the new code, made while the provider is still being asked.
		mailer.whileSending(() -> {
			try {
				verifyCode(pending, "999999");
				verifyCode(pending, "999998");
			}
			catch (Exception e) {
				throw new AssertionError(e);
			}
		});

		assertEquals(500, resend(pending).getResponse().getStatus());

		assertEquals(3, jdbc.queryForObject("select attempts from login_codes where user_id = ?", Integer.class,
				user.getId()), "one guess before the resend and two after it");
	}

	@Test
	void anUndoThatMatchesNothingIsLoggedAndTheOriginal500Stands(CapturedOutput output) throws Exception {
		User user = saveUser();
		mailer.refuseNext(1);
		mailer.whileSending(() -> jdbc.update("delete from login_codes where user_id = ?", user.getId()));

		assertEquals(500, login(user).getResponse().getStatus());

		assertTrue(output.getAll().contains("Undoing the failed LOGIN_CODE email for user " + user.getId()
				+ " found nothing to undo"));
	}

	@Test
	void anUndoThatFailsIsLoggedAtErrorWithItsOwnStackAndTheOriginal500Stands(CapturedOutput output) throws Exception {
		User user = saveUser();
		jdbc.execute("create or replace function block_login_code_delete() returns trigger as $$ begin "
				+ "raise exception 'blocked'; end $$ language plpgsql");
		mailer.refuseNext(1);
		mailer.whileSending(() -> jdbc.execute("create trigger block_login_code_delete before delete on login_codes "
				+ "for each row execute function block_login_code_delete()"));
		try {
			assertEquals(500, login(user).getResponse().getStatus());
		}
		finally {
			jdbc.execute("drop trigger if exists block_login_code_delete on login_codes");
		}

		assertEquals(1, codeRows(user), "the undo could not remove it, and said so");
		String all = output.getAll();
		assertTrue(all.contains("Undoing the failed LOGIN_CODE email for user " + user.getId() + " failed"));
		assertTrue(all.contains("blocked"), "the undo's own stack is in the log");
		assertFalse(all.contains(user.getEmail()), "no address anywhere in the log");
	}

	@Test
	void aFailedSendLeavesNeitherTheAddressNorTheCodeNorThePendingTokenInTheLog(CapturedOutput output) throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login(user));
		String code = lastCode();
		ageCode(user);
		mailer.refuseAll(true);

		assertEquals(500, resend(pending).getResponse().getStatus());
		ageCode(user);
		assertEquals(500, login(user).getResponse().getStatus());

		String all = output.getAll();
		assertFalse(all.contains(user.getEmail()), "no address anywhere in the log");
		assertFalse(all.contains(code), "no code");
		assertFalse(all.contains(pending.getValue()), "no pending token");
		assertTrue(all.contains("MailSendException") || all.contains("was not sent"),
				"the failure is still logged, by class");
	}
}
