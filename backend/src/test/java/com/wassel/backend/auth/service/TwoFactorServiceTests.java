package com.wassel.backend.auth.service;

import com.wassel.backend.auth.exception.CodeCooldownException;
import com.wassel.backend.auth.exception.InvalidCodeException;
import com.wassel.backend.auth.exception.LoginExpiredException;
import com.wassel.backend.auth.repository.LoginCodeRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import com.wassel.backend.users.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest
@ActiveProfiles("test")
class TwoFactorServiceTests {

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

	private final UUID school = UUID.randomUUID();

	@Autowired
	private TwoFactorService twoFactor;

	@Autowired
	private UserService userService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private LoginCodeRepository codeRepository;

	@Autowired
	private JdbcTemplate jdbc;

	@MockitoBean
	private Mailer mailer;

	@BeforeEach
	void cleanDatabase() {
		codeRepository.deleteAll();
		userRepository.deleteAll();
	}

	private User user() {
		return userService.createUser("par@wassel.test", "a-long-password", Role.PARENT, school);
	}

	private String lastCode() {
		ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
		verify(mailer, atLeastOnce()).send(anyString(), anyString(), body.capture());
		Matcher matcher = CODE.matcher(body.getValue());
		assertTrue(matcher.find(), "no code in the email");
		return matcher.group(1);
	}

	private static String wrongCodeFor(String code) {
		return code.equals("000000") ? "000001" : "000000";
	}

	private static String sha256(String value) throws Exception {
		return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
	}

	@Test
	void theEmailedCodeVerifiesAndReturnsTheUser() {
		User user = user();

		String pending = twoFactor.start(user);

		verify(mailer).send(eq("par@wassel.test"), eq("Your Wassel verification code"), anyString());
		assertEquals(user.getId(), twoFactor.verify(pending, lastCode()).getId());
	}

	@Test
	void aWrongCodeIsRejectedAndTheRightCodeStillWorksAfterwards() {
		String pending = twoFactor.start(user());
		String code = lastCode();

		assertThrows(InvalidCodeException.class, () -> twoFactor.verify(pending, wrongCodeFor(code)));

		twoFactor.verify(pending, code);
	}

	@Test
	void fiveWrongCodesEndTheLoginEvenForTheRightCode() {
		String pending = twoFactor.start(user());
		String code = lastCode();

		for (int i = 0; i < 4; i++) {
			assertThrows(InvalidCodeException.class, () -> twoFactor.verify(pending, wrongCodeFor(code)));
		}
		assertThrows(LoginExpiredException.class, () -> twoFactor.verify(pending, wrongCodeFor(code)));

		assertThrows(LoginExpiredException.class, () -> twoFactor.verify(pending, code));
	}

	@Test
	void anExpiredCodeIsRejected() {
		String pending = twoFactor.start(user());
		jdbc.update("update login_codes set expires_at = ?", OffsetDateTime.now().minusSeconds(1));

		assertThrows(InvalidCodeException.class, () -> twoFactor.verify(pending, lastCode()));
	}

	@Test
	void aCodeWorksOnlyOnce() {
		String pending = twoFactor.start(user());
		String code = lastCode();
		twoFactor.verify(pending, code);

		assertThrows(LoginExpiredException.class, () -> twoFactor.verify(pending, code));
	}

	@Test
	void anUnknownOrMissingPendingTokenIsExpired() {
		user();

		assertThrows(LoginExpiredException.class, () -> twoFactor.verify("not-a-real-token", "123456"));
		assertThrows(LoginExpiredException.class, () -> twoFactor.verify(null, "123456"));
	}

	@Test
	void aPendingLoginOlderThanFifteenMinutesIsExpired() {
		String pending = twoFactor.start(user());
		jdbc.update("update login_codes set created_at = ?, expires_at = ?", OffsetDateTime.now().minusMinutes(16),
				OffsetDateTime.now().plusMinutes(5));

		assertThrows(LoginExpiredException.class, () -> twoFactor.verify(pending, lastCode()));
	}

	@Test
	void anAccountDisabledAfterTheCodeWasSentCannotVerify() {
		User user = user();
		String pending = twoFactor.start(user);
		user.setEnabled(false);
		userRepository.save(user);

		assertThrows(LoginExpiredException.class, () -> twoFactor.verify(pending, lastCode()));
	}

	@Test
	void startingTwiceWithinTheCooldownSendsOnlyOneCodeAndWorksAgainAfterIt() {
		User user = user();
		String first = twoFactor.start(user);

		assertThrows(CodeCooldownException.class, () -> twoFactor.start(user));
		verify(mailer, times(1)).send(anyString(), anyString(), anyString());

		jdbc.update("update login_codes set sent_at = ?", OffsetDateTime.now().minusSeconds(61));
		String second = twoFactor.start(user);

		verify(mailer, times(2)).send(anyString(), anyString(), anyString());
		assertNotEquals(first, second);
		assertThrows(LoginExpiredException.class, () -> twoFactor.verify(first, lastCode()));
		twoFactor.verify(second, lastCode());
	}

	@Test
	void signingInAgainRightAfterACompletedLoginIsNotBlocked() {
		User user = user();
		twoFactor.verify(twoFactor.start(user), lastCode());

		String again = twoFactor.start(user);

		twoFactor.verify(again, lastCode());
	}

	@Test
	void theTableHoldsHashesNotTheCodeOrThePendingToken() throws Exception {
		String pending = twoFactor.start(user());
		String code = lastCode();

		assertEquals(sha256(pending), jdbc.queryForObject("select pending_hash from login_codes", String.class));
		assertEquals(sha256(code), jdbc.queryForObject("select code_hash from login_codes", String.class));
	}

	@Test
	void twoRequestsWithTheSameCodeSucceedExactlyOnce() throws Exception {
		String pending = twoFactor.start(user());
		String code = lastCode();

		List<Boolean> results = runTogether(() -> {
			try {
				twoFactor.verify(pending, code);
				return true;
			}
			catch (LoginExpiredException ex) {
				return false;
			}
		});

		assertEquals(1, results.stream().filter(won -> won).count());
	}

	@Test
	void twoLoginsForTheSameUserAtOnceSendExactlyOneCode() throws Exception {
		User user = user();

		List<Boolean> results = runTogether(() -> {
			try {
				twoFactor.start(user);
				return true;
			}
			catch (CodeCooldownException ex) {
				return false;
			}
		});

		assertEquals(1, results.stream().filter(won -> won).count());
		verify(mailer, times(1)).send(anyString(), anyString(), anyString());
		assertEquals(1, codeRepository.count());
	}

	@Test
	void resendingAfterTheCooldownMailsANewCodeAndTheOldOneStopsWorking() {
		String pending = twoFactor.start(user());
		String oldCode = lastCode();
		jdbc.update("update login_codes set sent_at = ?", OffsetDateTime.now().minusSeconds(61));

		twoFactor.resend(pending);

		verify(mailer, times(2)).send(anyString(), anyString(), anyString());
		String newCode = lastCode();
		assumeTrue(!newCode.equals(oldCode), "the same random code twice, a one in a million chance");
		assertThrows(InvalidCodeException.class, () -> twoFactor.verify(pending, oldCode));
		twoFactor.verify(pending, newCode);
	}

	@Test
	void resendingWithinTheCooldownIsRefusedAndSendsNothing() {
		String pending = twoFactor.start(user());

		assertThrows(CodeCooldownException.class, () -> twoFactor.resend(pending));

		verify(mailer, times(1)).send(anyString(), anyString(), anyString());
	}

	@Test
	void aResentCodeComesWithFreshAttempts() {
		String pending = twoFactor.start(user());
		String firstCode = lastCode();
		for (int i = 0; i < 3; i++) {
			assertThrows(InvalidCodeException.class, () -> twoFactor.verify(pending, wrongCodeFor(firstCode)));
		}
		jdbc.update("update login_codes set sent_at = ?", OffsetDateTime.now().minusSeconds(61));

		twoFactor.resend(pending);

		// Four wrong guesses would have run out of attempts on the first code (3 used, 5 allowed).
		String newCode = lastCode();
		for (int i = 0; i < 4; i++) {
			assertThrows(InvalidCodeException.class, () -> twoFactor.verify(pending, wrongCodeFor(newCode)));
		}
		twoFactor.verify(pending, newCode);
	}

	@Test
	void resendingAPendingLoginThatIsClosedIsExpired() {
		String pending = twoFactor.start(user());
		String code = lastCode();
		for (int i = 0; i < 4; i++) {
			assertThrows(InvalidCodeException.class, () -> twoFactor.verify(pending, wrongCodeFor(code)));
		}
		assertThrows(LoginExpiredException.class, () -> twoFactor.verify(pending, wrongCodeFor(code)));
		jdbc.update("update login_codes set sent_at = ?", OffsetDateTime.now().minusSeconds(61));

		assertThrows(LoginExpiredException.class, () -> twoFactor.resend(pending));

		jdbc.update("update login_codes set attempts = 0, created_at = ?", OffsetDateTime.now().minusMinutes(16));
		assertThrows(LoginExpiredException.class, () -> twoFactor.resend(pending));
		assertThrows(LoginExpiredException.class, () -> twoFactor.resend(null));
		verify(mailer, times(1)).send(anyString(), anyString(), anyString());
	}

	@Test
	void twoResendsAtOnceSendExactlyOneCode() throws Exception {
		String pending = twoFactor.start(user());
		jdbc.update("update login_codes set sent_at = ?", OffsetDateTime.now().minusSeconds(61));

		List<Boolean> results = runTogether(() -> {
			try {
				twoFactor.resend(pending);
				return true;
			}
			catch (CodeCooldownException ex) {
				return false;
			}
		});

		assertEquals(1, results.stream().filter(won -> won).count());
		verify(mailer, times(2)).send(anyString(), anyString(), anyString());
	}

	private static List<Boolean> runTogether(Callable<Boolean> attempt) throws Exception {
		CountDownLatch start = new CountDownLatch(1);
		Callable<Boolean> gated = () -> {
			start.await();
			return attempt.call();
		};
		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			Future<Boolean> first = pool.submit(gated);
			Future<Boolean> second = pool.submit(gated);
			start.countDown();
			return List.of(first.get(), second.get());
		}
		finally {
			pool.shutdown();
		}
	}
}
