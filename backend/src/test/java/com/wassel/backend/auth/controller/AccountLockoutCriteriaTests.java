package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.service.Mailer;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * PENDING MERGE of SCRUM-171 (account lockout, To Do: no branch or code yet). Skipped by default, because without the
 * feature the lock tests fail. Run them on the SCRUM-171 branch with
 * {@code sh ./mvnw test -Dpending.SCRUM-171=true -Dtest=AccountLockoutCriteriaTests}, and delete the
 * {@code @EnabledIfSystemProperty} line once 171 is merged.
 *
 * <p>SCRUM-171, written for SCRUM-236 from the ticket's acceptance criteria only: lock after 5 failed sign-ins in a row
 * for 15 minutes, a locked account fails even with the right password and with the same generic error as a wrong one,
 * a successful sign-in resets the count, the lock ends by itself, every lock is logged without a password. Everything goes
 * through {@code POST /api/auth/login} and {@code /2fa/verify}; the {@link Mailer} is watched because a locked account
 * must not be sent a code (that would show the password was right).
 *
 * <p>This class is standalone (not a {@code CriteriaTestSupport}): besides the HTTP answers it watches the
 * {@link Mailer} and the captured log, which is what the criteria about codes and log lines are about.
 *
 * <p>Assumptions to confirm against the real PR (the ticket leaves them open; see the SCRUM-236 report):
 * <ul>
 * <li>"Successful sign-in" is tested as a <em>completed</em> sign-in (password and code), which is a success under either
 * reading; a password-only success is not relied on for the reset.</li>
 * <li>Whether wrong 2FA codes, failures on unknown emails and invited accounts count towards the five is not tested: the
 * criteria do not say. (An unknown email's <em>answer</em> is compared with a locked account's below.)</li>
 * <li>{@link WithAShortLock} uses <b>assumed</b> setting names and units; fix them to the names in application.yml.</li>
 * </ul>
 */
@SpringBootTest
// print = NONE: MockMvc's default printout writes every request body, password included, to stdout, which the
// log assertion below would read as if the application had logged it.
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
@EnabledIfSystemProperty(named = "pending.SCRUM-171", matches = "true",
		disabledReason = "PENDING MERGE: SCRUM-171 (account lockout) is not built yet. Run with -Dpending.SCRUM-171=true")
class AccountLockoutCriteriaTests {

	private static final String RIGHT = "correct-horse-1";

	private static final String WRONG = "definitely-wrong-pw";

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@MockitoSpyBean
	private Mailer mailer;

	@BeforeEach
	void noMailYet() {
		clearInvocations(mailer);
	}

	// ---- helpers ----

	private User aUser() {
		return userRepository.save(User.builder().email(UUID.randomUUID() + "@wassel.test")
				.passwordHash(passwordEncoder.encode(RIGHT)).role(Role.PARENT).schoolId(UUID.randomUUID()).build());
	}

	private MvcResult login(String email, String password) throws Exception {
		return mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))).andReturn();
	}

	/** Every response header with its values, so a header that only a locked account gets would show. */
	private static java.util.Map<String, java.util.List<String>> headersOf(MvcResult result) {
		java.util.Map<String, java.util.List<String>> headers = new java.util.TreeMap<>();
		for (String name : result.getResponse().getHeaderNames()) {
			headers.put(name, result.getResponse().getHeaders(name));
		}
		return headers;
	}

	private void failTimes(String email, int times) throws Exception {
		for (int i = 0; i < times; i++) {
			assertEquals(401, login(email, WRONG).getResponse().getStatus(), "failure " + (i + 1));
		}
	}

	/** Password, then the emailed code: a sign-in that really succeeded. */
	private void completeSignIn(String email) throws Exception {
		clearInvocations(mailer);
		MvcResult login = login(email, RIGHT);
		assertEquals(204, login.getResponse().getStatus(), "the password step");
		ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
		verify(mailer).send(eq(email), anyString(), body.capture());
		Matcher code = CODE.matcher(body.getValue());
		assertTrue(code.find(), "the email carries a 6-digit code");
		mockMvc.perform(post("/api/auth/2fa/verify").cookie(login.getResponse().getCookie("wassel_2fa"))
				.contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code.group(1) + "\"}"))
				.andExpect(status().isOk());
	}

	// ---- the lock ----

	@Test
	void afterFiveFailuresInARowTheRightPasswordIsRejectedAndNoCodeIsSent() throws Exception {
		String email = aUser().getEmail();
		failTimes(email, 5);

		MvcResult locked = login(email, RIGHT);

		assertEquals(401, locked.getResponse().getStatus());
		assertNull(locked.getResponse().getCookie("wassel_2fa"), "no pending sign-in");
		assertNull(locked.getResponse().getCookie("wassel_token"), "no session");
		verify(mailer, never()).send(any(), any(), any());
	}

	@Test
	void fourFailuresDoNotLockTheAccount() throws Exception {
		String email = aUser().getEmail();
		failTimes(email, 4);

		assertEquals(204, login(email, RIGHT).getResponse().getStatus());
		verify(mailer).send(eq(email), anyString(), anyString());
	}

	@Test
	void aLockedAccountAnswersExactlyLikeAWrongPasswordAndLikeAnUnknownEmail() throws Exception {
		String email = aUser().getEmail();
		failTimes(email, 4);
		MvcResult wrong = login(email, WRONG);
		MvcResult locked = login(email, RIGHT);
		MvcResult unknown = login(UUID.randomUUID() + "@wassel.test", RIGHT);

		assertEquals(401, wrong.getResponse().getStatus());
		assertEquals(wrong.getResponse().getStatus(), locked.getResponse().getStatus());
		assertEquals(wrong.getResponse().getStatus(), unknown.getResponse().getStatus());
		assertEquals(wrong.getResponse().getContentAsString(), locked.getResponse().getContentAsString());
		assertEquals(wrong.getResponse().getContentAsString(), unknown.getResponse().getContentAsString());
		assertEquals(headersOf(wrong), headersOf(locked), "no header (Retry-After, Set-Cookie...) tells a lock apart");
		assertEquals(headersOf(wrong), headersOf(unknown));
	}

	@Test
	void aSuccessfulSignInResetsTheCount() throws Exception {
		String email = aUser().getEmail();
		failTimes(email, 4);
		completeSignIn(email);

		failTimes(email, 4);

		completeSignIn(email);
	}

	@Test
	void theLockBelongsToTheAccountNotToEveryone() throws Exception {
		String locked = aUser().getEmail();
		String other = aUser().getEmail();
		failTimes(locked, 5);

		completeSignIn(other);
	}

	/** Log lines that name this account and start a word with "lock" (not "clock" or "block"). */
	private static long lockLines(CapturedOutput output, User user) {
		Pattern lock = Pattern.compile("(?i)\\block");
		return output.getAll().lines().filter(line -> lock.matcher(line).find()
				&& (line.contains(user.getEmail()) || line.contains(user.getId().toString()))).count();
	}

	@Test
	void everyLockIsLoggedAndNoPasswordIsInTheLog(CapturedOutput output) throws Exception {
		User user = aUser();
		String email = user.getEmail();
		failTimes(email, 3);
		long beforeFourth = lockLines(output, user);
		failTimes(email, 1);
		long afterFourth = lockLines(output, user);
		failTimes(email, 1);
		long afterFifth = lockLines(output, user);
		login(email, RIGHT);

		// A line that merely mentions locking on every failure would raise both steps alike; the lock is the extra line.
		assertTrue(afterFifth - afterFourth > afterFourth - beforeFourth,
				"the fifth failure writes a lock line the fourth does not (new lines: 4th " + (afterFourth - beforeFourth)
						+ ", 5th " + (afterFifth - afterFourth) + ")");
		assertFalse(output.getAll().contains(WRONG), "no wrong password in the log");
		assertFalse(output.getAll().contains(RIGHT), "no right password in the log");
	}

	@Test
	void theLockDoesNotDependOnHowTheEmailIsTyped() throws Exception {
		// Only meaningful if sign-in itself ignores the case of an email; otherwise the capitals are just an unknown email.
		String probe = aUser().getEmail();
		assumeTrue(login(probe.toUpperCase(), RIGHT).getResponse().getStatus() == 204,
				"sign-in is case-sensitive in this build, so there is no case variant to lock");
		clearInvocations(mailer);
		String email = aUser().getEmail();
		failTimes(email, 5);

		assertEquals(401, login(email.toUpperCase(), RIGHT).getResponse().getStatus());
		assertEquals(401, login(" " + email + " ", RIGHT).getResponse().getStatus());
		verify(mailer, never()).send(any(), any(), any());
	}

	// ---- both numbers are settings, and the lock ends by itself ----

	/**
	 * ASSUMED setting names and units ({@code wassel.auth.lockout.max-failures}, {@code wassel.auth.lockout.duration} as
	 * a Spring duration). Replace them with the real keys from SCRUM-171's application.yml before relying on this class.
	 */
	@Nested
	@TestPropertySource(properties = {
			"wassel.auth.lockout.max-failures=2",
			"wassel.auth.lockout.duration=2s" })
	class WithAShortLock {

		@Test
		void bothNumbersAreSettingsAndTheLockEndsOnItsOwn() throws Exception {
			String email = aUser().getEmail();
			failTimes(email, 2);

			assertEquals(401, login(email, RIGHT).getResponse().getStatus(), "locked after the configured two");

			Thread.sleep(2500);

			assertEquals(204, login(email, RIGHT).getResponse().getStatus(), "no admin action needed once time is up");
		}

		@Test
		void afterTheLockEndsTheCountStartsOverSoOneFailureDoesNotLockAgain() throws Exception {
			String email = aUser().getEmail();
			failTimes(email, 2);
			assertEquals(401, login(email, RIGHT).getResponse().getStatus(), "locked first, or there is no expiry to test");
			Thread.sleep(2500);

			assertEquals(401, login(email, WRONG).getResponse().getStatus());

			assertEquals(204, login(email, RIGHT).getResponse().getStatus(), "one failure after the lock is not two");
		}

		@Test
		void aSecondLockIsLoggedToo(CapturedOutput output) throws Exception {
			User user = aUser();
			failTimes(user.getEmail(), 2);
			long afterFirstLock = lockLines(output, user);
			Thread.sleep(2500);
			failTimes(user.getEmail(), 2);

			assertTrue(lockLines(output, user) > afterFirstLock, "the second lock writes its own line");
		}
	}
}
