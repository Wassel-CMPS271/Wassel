package com.wassel.backend.auth.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.auth.support.AuthEmailSupport;
import com.wassel.backend.common.config.ClockConfig;
import com.wassel.backend.users.entity.User;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.ZonedDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-289, "The daily cap" and the answers table in docs/contracts/auth-email.md, with the caps set to 3 (all kinds),
 * 1 (reset links) and 2 (one account). The refusal is checked against the samples in docs/contracts/samples/auth-email/.
 */
@TestPropertySource(properties = { "wassel.auth.email.daily-cap=3", "wassel.auth.email.reset-daily-cap=1",
		"wassel.auth.email.per-account-daily-cap=2" })
class AuthEmailCapContractTests extends AuthEmailSupport {

	private static final int DAILY_CAP = 3;

	private static final Path SAMPLES = Path.of("../docs/contracts/samples/auth-email/");

	@BeforeEach
	void anEmptyDay() {
		jdbc.update("delete from auth_emails");
	}

	private void assertTheSample(MvcResult refused, String sample) throws Exception {
		assertEquals(503, refused.getResponse().getStatus());
		String expected = Files.readString(SAMPLES.resolve(sample));
		String actual = refused.getResponse().getContentAsString();
		for (String field : new String[] { "title", "status", "detail", "instance" }) {
			assertEquals((Object) JsonPath.read(expected, "$." + field), JsonPath.read(actual, "$." + field), field);
		}
		long retryAfter = Long.parseLong(refused.getResponse().getHeader("Retry-After"));
		assertTrue(retryAfter >= 1 && retryAfter <= 86_400, "Retry-After is the seconds to midnight: " + retryAfter);
		assertEquals(secondsToBeirutMidnight(), retryAfter, 5, "and it is the real figure, not just a plausible one");
	}

	private static long secondsToBeirutMidnight() {
		ZonedDateTime now = ZonedDateTime.now(ClockConfig.SCHOOL_ZONE);
		return Duration.between(now, now.toLocalDate().plusDays(1).atStartOfDay(ClockConfig.SCHOOL_ZONE)).toSeconds();
	}

	private void useUpTheDay() throws Exception {
		for (int i = 0; i < DAILY_CAP; i++) {
			assertEquals(204, login(saveUser()).getResponse().getStatus());
		}
	}

	@Test
	void aLoginOverTheDailyCapIs503WithTheSampleBodyAndWritesNothing() throws Exception {
		useUpTheDay();
		User refused = saveUser();

		assertTheSample(login(refused), "login-daily-cap.json");

		assertEquals(0, codeRows(refused));
		assertEquals(DAILY_CAP, jdbc.queryForObject("select count(*) from auth_emails", Integer.class));
		assertEquals(DAILY_CAP, mailer.sent().size());
	}

	@Test
	void aLoginRefusedByThePerAccountLimitLeavesThePreviousPendingLoginWorking() throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login(user));
		ageCode(user);
		assertEquals(204, resend(pending).getResponse().getStatus());
		ageCode(user);

		assertTheSample(login(user), "login-daily-cap.json");

		assertEquals(200, verifyCode(pending, lastCode()).getResponse().getStatus());
	}

	@Test
	void aLoginRefusedByTheDailyCapLeavesThePreviousPendingLoginWorking() throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login(user));
		String received = lastCode();
		assertEquals(204, login(saveUser()).getResponse().getStatus());
		assertEquals(204, login(saveUser()).getResponse().getStatus());
		ageCode(user);

		assertTheSample(login(user), "login-daily-cap.json");

		assertEquals(1, authEmailRows(user, "LOGIN_CODE"), "the account's own limit (2) was not what refused it");
		assertEquals(200, verifyCode(pending, received).getResponse().getStatus());
	}

	@Test
	void aResendOverTheCapIs503AndTheOldCodeStillVerifies() throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login(user));
		ageCode(user);
		assertEquals(204, resend(pending).getResponse().getStatus());
		String current = lastCode();
		ageCode(user);

		assertTheSample(resend(pending), "resend-daily-cap.json");

		assertEquals(200, verifyCode(pending, current).getResponse().getStatus());
	}

	@Test
	void aSendThatFailedStillCountsAndARefusedOrCooldownBlockedOneDoesNot() throws Exception {
		User failing = saveUser();
		mailer.refuseNext(1);
		assertEquals(500, login(failing).getResponse().getStatus());
		assertEquals(1, authEmailRows(failing, "LOGIN_CODE"), "the provider was asked");
		jdbc.update("delete from auth_emails");

		User resending = saveUser();
		Cookie pending = pendingCookie(login(resending));
		ageCode(resending);
		mailer.refuseNext(1);
		assertEquals(500, resend(pending).getResponse().getStatus());
		assertEquals(1, authEmailRows(resending, "RESEND_CODE"), "a failed resend took its slot too");
		jdbc.update("delete from auth_emails");

		User forgetful = saveUser();
		mailer.refuseNext(1);
		assertEquals(204, forgotPassword(forgetful.getEmail()).getResponse().getStatus());
		assertEquals(1, authEmailRows(forgetful, "RESET_LINK"), "and so did a failed reset");
		jdbc.update("delete from auth_emails");

		User user = saveUser();
		assertEquals(204, login(user).getResponse().getStatus());
		assertEquals(429, login(user).getResponse().getStatus());
		assertEquals(1, authEmailRows(user, "LOGIN_CODE"), "a cooldown-blocked login takes no slot");
	}

	@Test
	void aResetOverTheResetShareIs204SendsNothingAndLeavesNoToken() throws Exception {
		User first = saveUser();
		User second = saveUser();
		assertEquals(204, forgotPassword(first.getEmail()).getResponse().getStatus());
		assertEquals(1, authEmailRows(first, "RESET_LINK"));

		MvcResult capped = forgotPassword(second.getEmail());

		assertEquals(204, capped.getResponse().getStatus());
		assertEquals("", capped.getResponse().getContentAsString());
		assertEquals(0, unusedTokens(second));
		assertEquals(1, mailer.sent().size());
	}

	@Test
	void aResetOverTheDailyCapIs204SendsNothingAndLeavesNoToken() throws Exception {
		useUpTheDay();
		User user = saveUser();

		assertEquals(204, forgotPassword(user.getEmail()).getResponse().getStatus());

		assertEquals(0, unusedTokens(user));
		assertEquals(DAILY_CAP, mailer.sent().size());
	}
}
