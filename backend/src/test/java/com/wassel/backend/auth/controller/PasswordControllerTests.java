package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.event.PasswordSetEvent;
import com.wassel.backend.auth.exception.InvalidPasswordTokenException;
import com.wassel.backend.auth.repository.PasswordTokenRepository;
import com.wassel.backend.auth.service.Mailer;
import com.wassel.backend.auth.service.PasswordService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import com.wassel.backend.users.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@RecordApplicationEvents
class PasswordControllerTests {

	private static final String OLD_PASSWORD = "the-old-password";

	private static final String NEW_PASSWORD = "a-brand-new-password";

	private static final Pattern TOKEN = Pattern.compile("token=([\\w-]+)");

	private final UUID school = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserService userService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private PasswordTokenRepository tokenRepository;

	@Autowired
	private PasswordService passwordService;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TransactionTemplate transactions;

	@Autowired
	private ApplicationEvents applicationEvents;

	@MockitoBean
	private Mailer mailer;

	@BeforeEach
	void cleanDatabase() {
		tokenRepository.deleteAll();
		userRepository.deleteAll();
	}

	private User invitedUser(String email) {
		User user = userService.createInvitedUser(email, Role.PARENT, school);
		passwordService.sendInvite(user);
		return user;
	}

	private User userWithPassword(String email) {
		return userService.createUser(email, OLD_PASSWORD, Role.PARENT, school);
	}

	private List<String> bodies(int expectedMails) {
		ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
		verify(mailer, times(expectedMails)).send(anyString(), anyString(), body.capture());
		return body.getAllValues();
	}

	private String lastToken() {
		ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
		verify(mailer, atLeastOnce()).send(anyString(), anyString(), body.capture());
		Matcher matcher = TOKEN.matcher(body.getValue());
		assertTrue(matcher.find(), "no token link in the email");
		return matcher.group(1);
	}

	private ResultActions setPassword(String token, String password) throws Exception {
		return mockMvc.perform(post("/api/auth/password").contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"%s\",\"password\":\"%s\"}".formatted(token, password)));
	}

	private ResultActions forgotPassword(String email) throws Exception {
		return mockMvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\"}".formatted(email)));
	}

	private ResultActions login(String email, String password) throws Exception {
		return mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)));
	}

	// Rounded to the minute: created_at is stamped a few milliseconds after the expiry is computed.
	private long tokenLifetimeInMinutes() {
		return jdbc.queryForObject("select created_at, expires_at from password_tokens",
				(rs, row) -> Duration.between(rs.getObject(1, OffsetDateTime.class),
						rs.getObject(2, OffsetDateTime.class)).plusSeconds(30).toMinutes());
	}

	private void assertInvalidLink(ResultActions result) throws Exception {
		result.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("This link is invalid or has expired."));
	}

	@Test
	void anInvitedUserSetsAPasswordFromTheLinkAndThenLogsIn() throws Exception {
		User user = invitedUser("new@wassel.test");
		assertTrue(bodies(1).getFirst().contains("/set-password?token="));
		assertEquals(24 * 60, tokenLifetimeInMinutes());
		login("new@wassel.test", NEW_PASSWORD).andExpect(status().isUnauthorized());

		setPassword(lastToken(), NEW_PASSWORD).andExpect(status().isNoContent());

		login("new@wassel.test", NEW_PASSWORD).andExpect(status().isNoContent());
		assertEquals(List.of(new PasswordSetEvent(user.getId())),
				applicationEvents.stream(PasswordSetEvent.class).toList());
	}

	@Test
	void forgotPasswordEmailsAResetLinkThatReplacesThePassword() throws Exception {
		userWithPassword("par@wassel.test");

		forgotPassword("  PAR@wassel.test ").andExpect(status().isNoContent());
		assertTrue(bodies(1).getFirst().contains("/reset-password?token="));
		assertEquals(30, tokenLifetimeInMinutes());
		setPassword(lastToken(), NEW_PASSWORD).andExpect(status().isNoContent());

		login("par@wassel.test", OLD_PASSWORD).andExpect(status().isUnauthorized());
		login("par@wassel.test", NEW_PASSWORD).andExpect(status().isNoContent());
	}

	@Test
	void forgotPasswordOnAnInvitedAccountResendsTheSetPasswordLink() throws Exception {
		userService.createInvitedUser("new@wassel.test", Role.PARENT, school);

		forgotPassword("new@wassel.test").andExpect(status().isNoContent());

		assertTrue(bodies(1).getFirst().contains("/set-password?token="));
	}

	@Test
	void aLinkWorksOnlyOnce() throws Exception {
		invitedUser("new@wassel.test");
		String token = lastToken();

		setPassword(token, NEW_PASSWORD).andExpect(status().isNoContent());

		assertInvalidLink(setPassword(token, "another-new-password"));
		login("new@wassel.test", NEW_PASSWORD).andExpect(status().isNoContent());
	}

	@Test
	void anExpiredLinkIsRejected() throws Exception {
		invitedUser("new@wassel.test");
		jdbc.update("update password_tokens set expires_at = ?", OffsetDateTime.now().minusMinutes(1));

		assertInvalidLink(setPassword(lastToken(), NEW_PASSWORD));
		login("new@wassel.test", NEW_PASSWORD).andExpect(status().isUnauthorized());
	}

	@Test
	void anUnknownTokenIsRejectedLikeAnExpiredOne() throws Exception {
		assertInvalidLink(setPassword("not-a-real-token", NEW_PASSWORD));
	}

	@Test
	void aNewLinkVoidsTheOlderOne() throws Exception {
		User user = invitedUser("new@wassel.test");
		String older = lastToken();
		passwordService.sendInvite(user);
		String newer = lastToken();
		assertNotEquals(older, newer);

		assertInvalidLink(setPassword(older, NEW_PASSWORD));
		setPassword(newer, NEW_PASSWORD).andExpect(status().isNoContent());
	}

	@Test
	void oneUsersNewLinkAndCooldownLeaveAnotherUsersLinkAlone() throws Exception {
		invitedUser("first@wassel.test");
		String firstUsersToken = lastToken();
		User second = userWithPassword("second@wassel.test");

		// The first user's fresh token must not count towards the second user's cooldown.
		forgotPassword("second@wassel.test").andExpect(status().isNoContent());
		verify(mailer, times(1)).send(eq("second@wassel.test"), anyString(), anyString());
		passwordService.sendInvite(second);

		setPassword(firstUsersToken, NEW_PASSWORD).andExpect(status().isNoContent());
	}

	@Test
	void settingAPasswordVoidsEveryOtherUnusedLink() throws Exception {
		User user = invitedUser("new@wassel.test");
		jdbc.update("insert into password_tokens (id, user_id, token_hash, expires_at, created_at) values (?, ?, ?, ?, ?)",
				UUID.randomUUID(), user.getId(), "x".repeat(64), OffsetDateTime.now().plusHours(1),
				OffsetDateTime.now());

		setPassword(lastToken(), NEW_PASSWORD).andExpect(status().isNoContent());

		assertEquals(0, jdbc.queryForObject("select count(*) from password_tokens where used_at is null", Integer.class));
	}

	@Test
	void anAccountDisabledAfterTheInviteCannotUseTheLink() throws Exception {
		User user = invitedUser("new@wassel.test");
		user.setEnabled(false);
		userRepository.save(user);

		assertInvalidLink(setPassword(lastToken(), NEW_PASSWORD));
	}

	@Test
	void forgotPasswordForAnUnknownEmailLooksSuccessfulAndSendsNothing() throws Exception {
		forgotPassword("nobody@wassel.test").andExpect(status().isNoContent());

		verify(mailer, never()).send(any(), any(), any());
	}

	@Test
	void forgotPasswordForADisabledAccountLooksSuccessfulAndSendsNothing() throws Exception {
		User user = userWithPassword("off@wassel.test");
		user.setEnabled(false);
		userRepository.save(user);

		forgotPassword("off@wassel.test").andExpect(status().isNoContent());

		verify(mailer, never()).send(any(), any(), any());
	}

	@Test
	void forgotPasswordSendsNothingWithinTheCooldownAndAgainAfterIt() throws Exception {
		userWithPassword("par@wassel.test");

		forgotPassword("par@wassel.test").andExpect(status().isNoContent());
		forgotPassword("par@wassel.test").andExpect(status().isNoContent());
		verify(mailer, times(1)).send(eq("par@wassel.test"), anyString(), anyString());

		jdbc.update("update password_tokens set created_at = ?", OffsetDateTime.now().minusSeconds(61));
		forgotPassword("par@wassel.test").andExpect(status().isNoContent());
		verify(mailer, times(2)).send(eq("par@wassel.test"), anyString(), anyString());
	}

	@Test
	void aWeakPasswordIsRejectedWithAFieldErrorAndTheLinkStaysUsable() throws Exception {
		invitedUser("new@wassel.test");
		String token = lastToken();

		setPassword(token, "short").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.password").exists());

		setPassword(token, NEW_PASSWORD).andExpect(status().isNoContent());
	}

	@Test
	void aPasswordOverBcryptsByteLimitIsRejectedNotAServerError() throws Exception {
		invitedUser("new@wassel.test");

		// 40 characters but 80 bytes in UTF-8
		setPassword(lastToken(), "é".repeat(40)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.password").exists());
	}

	@Test
	void thePasswordLimitsAreTenCharactersAndSeventyTwoBytes() throws Exception {
		invitedUser("new@wassel.test");
		String token = lastToken();

		setPassword(token, "a".repeat(9)).andExpect(status().isBadRequest());
		setPassword(token, "a".repeat(73)).andExpect(status().isBadRequest());
		setPassword(token, "a".repeat(72)).andExpect(status().isNoContent());

		invitedUser("other@wassel.test");
		setPassword(lastToken(), "a".repeat(10)).andExpect(status().isNoContent());
	}

	@Test
	void aBlankTokenIsRejectedWithAFieldError() throws Exception {
		setPassword("", NEW_PASSWORD).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.token").exists());
	}

	@Test
	void forgotPasswordWithoutAnEmailIsRejectedWithAFieldError() throws Exception {
		mockMvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").value("Email is required"));
	}

	@Test
	void theStoredValueIsTheSha256OfTheTokenNotTheToken() throws Exception {
		invitedUser("new@wassel.test");
		String stored = jdbc.queryForObject("select token_hash from password_tokens", String.class);

		assertEquals(HexFormat.of().formatHex(
				MessageDigest.getInstance("SHA-256").digest(lastToken().getBytes(StandardCharsets.UTF_8))), stored);
	}

	@Test
	void aTokenCanOnlyBeMarkedUsedOnce() {
		invitedUser("new@wassel.test");
		UUID id = tokenRepository.findAll().getFirst().getId();

		Integer first = transactions.execute(status -> tokenRepository.markUsed(id, Instant.now()));
		Integer second = transactions.execute(status -> tokenRepository.markUsed(id, Instant.now()));

		assertEquals(1, first);
		assertEquals(0, second);
	}

	@Test
	void twoRequestsWithTheSameTokenSucceedExactlyOnce() throws Exception {
		invitedUser("new@wassel.test");
		String token = lastToken();
		CountDownLatch start = new CountDownLatch(1);
		Callable<Boolean> attempt = () -> {
			start.await();
			try {
				passwordService.setPassword(token, NEW_PASSWORD);
				return true;
			}
			catch (InvalidPasswordTokenException ex) {
				return false;
			}
		};

		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			Future<Boolean> first = pool.submit(attempt);
			Future<Boolean> second = pool.submit(attempt);
			start.countDown();
			assertEquals(1, List.of(first.get(), second.get()).stream().filter(won -> won).count());
		}
		finally {
			pool.shutdown();
		}
	}
}
