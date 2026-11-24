package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.support.AuthEmailSupport;
import com.wassel.backend.common.Parallel;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * SCRUM-289 review finding 1: anyone who knows an address can call forgot-password, so a flood of it for one account must
 * never stop that account signing in. The caps are the real defaults (120 in all, 30 reset links, 10 for one account).
 */
@TestPropertySource(properties = { "wassel.auth.email.daily-cap=120", "wassel.auth.email.reset-daily-cap=30",
		"wassel.auth.email.per-account-daily-cap=10" })
class ForgotPasswordFloodTests extends AuthEmailSupport {

	@BeforeEach
	void anEmptyDay() {
		jdbc.update("delete from auth_emails");
	}

	@Test
	void twentyFiveParallelRequestsForOneAddressSendOneLinkAndTheOwnerCanStillSignIn() throws Exception {
		User victim = saveUser();
		Callable<Integer> forgot = () -> forgotPassword(victim.getEmail()).getResponse().getStatus();
		List<Callable<Integer>> flood = new ArrayList<>();
		for (int i = 0; i < 25; i++) {
			flood.add(forgot);
		}

		List<Integer> answers = Parallel.inParallel(flood);

		assertEquals(25, answers.stream().filter(status -> status == 204).count(), "every answer is the same 204");
		assertEquals(1, mailer.sent().size(), "the cooldown holds under parallel requests");
		assertEquals(1, authEmailRows(victim, "RESET_LINK"));
		assertEquals(1, unusedTokens(victim));
		assertEquals(204, login(victim).getResponse().getStatus(), "the victim signs in with the right password");
	}

	@Test
	void anAccountWhoseResetLimitIsUsedUpCanStillSignInAndResend() throws Exception {
		User victim = saveUser();
		for (int i = 0; i < 10; i++) {
			jdbc.update("insert into auth_emails (id, user_id, kind, created_at) values (gen_random_uuid(), ?, "
					+ "'RESET_LINK', now())", victim.getId());
		}

		var pending = pendingCookie(login(victim));
		ageCode(victim);

		assertEquals(204, resend(pending).getResponse().getStatus());
		assertEquals(204, forgotPassword(victim.getEmail()).getResponse().getStatus());
		assertEquals(0, mailer.sent().stream().filter(mail -> mail.subject().contains("Reset")).count(),
				"the reset itself is refused at the account's own limit");
	}

	@Test
	void aFloodOfResetsForManyAddressesStopsAtTheResetShareAndLeavesRoomToSignIn() throws Exception {
		List<Callable<Integer>> flood = new ArrayList<>();
		for (int i = 0; i < 40; i++) {
			User target = saveUser();
			flood.add(() -> forgotPassword(target.getEmail()).getResponse().getStatus());
		}

		Parallel.inParallel(flood);

		assertEquals(30, jdbc.queryForObject("select count(*) from auth_emails where kind = 'RESET_LINK'", Integer.class));
		assertEquals(204, login(saveUser()).getResponse().getStatus(), "the reset flood left room for a sign-in");
	}
}
