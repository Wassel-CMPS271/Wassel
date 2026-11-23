package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.support.AuthEmailSupport;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SCRUM-289, forgot-password in docs/contracts/auth-email.md: 204 for every outcome, the link goes out after the token is
 * committed, and a failed send leaves no token and does not block the next request.
 */
@ExtendWith(OutputCaptureExtension.class)
class ForgotPasswordEmailTests extends AuthEmailSupport {

	private static void assertAnEmpty204(MvcResult answer) throws Exception {
		assertEquals(204, answer.getResponse().getStatus());
		assertEquals("", answer.getResponse().getContentAsString());
	}

	@Test
	void aFailedSendIs204LeavesNoTokenLogsTheUserAndClassOnlyAndTheNextRequestSendsALink(CapturedOutput output)
			throws Exception {
		User user = saveUser();
		mailer.refuseNext(1);

		assertAnEmpty204(forgotPassword(user.getEmail()));

		assertEquals(0, unusedTokens(user), "no link the user never received");
		String line = output.getAll().lines().filter(l -> l.contains("was not sent")).findFirst().orElseThrow();
		assertTrue(line.contains(user.getId().toString()) && line.contains("MailSendException"));
		assertFalse(output.getAll().contains(user.getEmail()), "no address anywhere in the log");

		assertAnEmpty204(forgotPassword(user.getEmail()));
		assertEquals(1, mailer.sent().size(), "no cooldown for a link that was never sent");
		assertEquals(1, unusedTokens(user));
	}

	private int useTheLink(String token) throws Exception {
		return mockMvc.perform(post("/api/auth/password").contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"%s\",\"password\":\"a-brand-new-password\"}".formatted(token)))
				.andReturn().getResponse().getStatus();
	}

	@Test
	void aFailedSendLeavesTheLinkTheUserAlreadyHad() throws Exception {
		User user = saveUser();
		forgotPassword(user.getEmail());
		String earlier = lastToken();
		ageTokens(user);
		mailer.refuseNext(1);

		assertAnEmpty204(forgotPassword(user.getEmail()));

		assertEquals(1, unusedTokens(user), "only the earlier link, which was never replaced");
		assertEquals(204, useTheLink(earlier), "an invited user whose reset failed can still use the invite link");
	}

	@Test
	void aLinkThatWasSentVoidsTheOlderOne() throws Exception {
		User user = saveUser();
		forgotPassword(user.getEmail());
		String older = lastToken();
		ageTokens(user);

		forgotPassword(user.getEmail());
		String newer = lastToken();

		assertEquals(1, unusedTokens(user));
		assertEquals(400, useTheLink(older));
		assertEquals(204, useTheLink(newer));
	}

	@Test
	void everyOutcomeLooksTheSame() throws Exception {
		User known = saveUser();
		User disabled = saveUser();
		jdbc.update("update users set enabled = false where id = ?", disabled.getId());

		assertAnEmpty204(forgotPassword("nobody-" + UUID.randomUUID() + "@wassel.test"));
		assertAnEmpty204(forgotPassword(disabled.getEmail()));
		assertAnEmpty204(forgotPassword(known.getEmail()));
		assertAnEmpty204(forgotPassword(known.getEmail()));
		assertEquals(1, mailer.sent().size(), "only the first for the known account was sent");
	}

	@Test
	void aSuccessfulResetWritesOneResetLinkRow() throws Exception {
		User user = saveUser();

		forgotPassword(user.getEmail());

		assertEquals(1, authEmailRows(user, "RESET_LINK"));
		assertTrue(mailer.sent().get(0).body().contains("/reset-password?token="));
	}

	@Test
	void anInvitedAccountWithNoPasswordGetsTheSetPasswordWording() throws Exception {
		User invited = userRepository.save(User.builder().email(UUID.randomUUID() + "@wassel.test")
				.passwordHash(User.NO_PASSWORD_HASH).role(Role.PARENT).schoolId(school).build());

		forgotPassword(invited.getEmail());

		assertEquals("Set your Wassel password", mailer.sent().get(0).subject());
		assertTrue(mailer.sent().get(0).body().contains("/set-password?token="));
	}
}
