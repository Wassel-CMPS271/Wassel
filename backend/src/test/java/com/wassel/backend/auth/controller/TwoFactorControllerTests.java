package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.repository.LoginCodeRepository;
import com.wassel.backend.auth.service.Mailer;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The HTTP contract of the second login step. The rules behind it are covered by TwoFactorServiceTests. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TwoFactorControllerTests {

	private static final String SESSION_COOKIE = "wassel_token";

	private static final String PENDING_COOKIE = "wassel_2fa";

	private static final String PASSWORD = "correct-horse-battery";

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

	private final UUID school = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private LoginCodeRepository loginCodeRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@Autowired
	private JdbcTemplate jdbc;

	@MockitoBean
	private Mailer mailer;

	@BeforeEach
	void cleanDatabase() {
		loginCodeRepository.deleteAll();
		userRepository.deleteAll();
	}

	private User saveUser() {
		return userRepository.save(User.builder().email("par@wassel.test").passwordHash(passwordEncoder.encode(PASSWORD))
				.role(Role.PARENT).schoolId(school).build());
	}

	private MvcResult login() throws Exception {
		return mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"par@wassel.test\",\"password\":\"%s\"}".formatted(PASSWORD))).andReturn();
	}

	private static Cookie pendingCookie(MvcResult login) {
		String header = login.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream()
				.filter(candidate -> candidate.startsWith(PENDING_COOKIE + "=")).findFirst().orElseThrow();
		return new Cookie(PENDING_COOKIE, header.substring((PENDING_COOKIE + "=").length(), header.indexOf(';')));
	}

	private String lastCode() {
		ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
		verify(mailer, atLeastOnce()).send(anyString(), anyString(), body.capture());
		Matcher matcher = CODE.matcher(body.getValue());
		assertTrue(matcher.find(), "no code in the email");
		return matcher.group(1);
	}

	private ResultActions verifyCode(Cookie pending, String code) throws Exception {
		return mockMvc.perform(post("/api/auth/2fa/verify").cookie(pending).contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"%s\"}".formatted(code)));
	}

	private static String wrongCodeFor(String code) {
		return code.equals("000000") ? "000001" : "000000";
	}

	@Test
	void theEmailedCodeReturnsTheUserAndSetsTheSessionCookieAndClearsThePendingOne() throws Exception {
		User user = saveUser();
		Cookie pending = pendingCookie(login());

		verifyCode(pending, lastCode())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(user.getId().toString()))
				.andExpect(jsonPath("$.email").value("par@wassel.test"))
				.andExpect(jsonPath("$.role").value("PARENT"))
				.andExpect(jsonPath("$.schoolId").value(school.toString()))
				.andExpect(jsonPath("$.token").doesNotExist())
				.andExpect(header().stringValues(HttpHeaders.SET_COOKIE, hasItem(allOf(
						startsWith(SESSION_COOKIE + "="), containsString("HttpOnly"), containsString("SameSite=Strict"),
						containsString("Path=/"), containsString("Max-Age=3600"), not(containsString("Secure"))))))
				.andExpect(header().stringValues(HttpHeaders.SET_COOKIE,
						hasItem(allOf(startsWith(PENDING_COOKIE + "=;"), containsString("Max-Age=0")))));
	}

	@Test
	void aWrongCodeIsABadRequestThatSetsNoCookie() throws Exception {
		saveUser();
		Cookie pending = pendingCookie(login());

		verifyCode(pending, wrongCodeFor(lastCode()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("That code is incorrect or has expired."))
				.andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
	}

	// Also guards against AuthService.completeLogin becoming @Transactional, which would roll back the count.
	@Test
	void theFifthWrongCodeEndsTheLoginAndEvenTheRightCodeIsThenRefused() throws Exception {
		saveUser();
		Cookie pending = pendingCookie(login());
		String code = lastCode();

		for (int i = 0; i < 4; i++) {
			verifyCode(pending, wrongCodeFor(code)).andExpect(status().isBadRequest());
		}
		verifyCode(pending, wrongCodeFor(code))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.detail").value("Your sign-in has expired. Please sign in again."));

		verifyCode(pending, code).andExpect(status().isUnauthorized());
	}

	@Test
	void verifyingWithoutThePendingCookieIsUnauthorized() throws Exception {
		saveUser();
		login();

		mockMvc.perform(post("/api/auth/2fa/verify").contentType(MediaType.APPLICATION_JSON)
						.content("{\"code\":\"%s\"}".formatted(lastCode())))
				.andExpect(status().isUnauthorized())
				.andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
	}

	@Test
	void aCodeThatIsNotSixDigitsIsRejectedWithAFieldError() throws Exception {
		saveUser();
		Cookie pending = pendingCookie(login());

		verifyCode(pending, "12ab").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.code").value("Enter the 6-digit code"));
		verifyCode(pending, "").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.code").exists());
	}

	@Test
	void aCodePastedWithSurroundingSpacesIsAccepted() throws Exception {
		saveUser();
		Cookie pending = pendingCookie(login());

		verifyCode(pending, " " + lastCode() + " ").andExpect(status().isOk());
	}

	@Test
	void aSecondLoginWithinAMinuteIsTooManyRequestsAndSendsNoSecondCode() throws Exception {
		saveUser();
		login();

		mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"par@wassel.test\",\"password\":\"%s\"}".formatted(PASSWORD)))
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.detail").value("Please wait a minute before requesting another code."))
				.andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
		verify(mailer, times(1)).send(anyString(), anyString(), anyString());
	}

	@Test
	void resendingMailsANewCodeThatCompletesTheLogin() throws Exception {
		saveUser();
		Cookie pending = pendingCookie(login());
		jdbc.update("update login_codes set sent_at = ?", OffsetDateTime.now().minusSeconds(61));

		mockMvc.perform(post("/api/auth/2fa/resend").cookie(pending))
				.andExpect(status().isNoContent())
				.andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

		verify(mailer, times(2)).send(anyString(), anyString(), anyString());
		verifyCode(pending, lastCode()).andExpect(status().isOk());
	}

	@Test
	void resendingWithinAMinuteIsTooManyRequests() throws Exception {
		saveUser();
		Cookie pending = pendingCookie(login());

		mockMvc.perform(post("/api/auth/2fa/resend").cookie(pending))
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.detail").value("Please wait a minute before requesting another code."));
		verify(mailer, times(1)).send(anyString(), anyString(), anyString());
	}

	@Test
	void resendingWithoutThePendingCookieIsUnauthorized() throws Exception {
		saveUser();
		login();

		mockMvc.perform(post("/api/auth/2fa/resend"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.detail").value("Your sign-in has expired. Please sign in again."));
	}

	@Test
	void thePendingTokenIsNotASession() throws Exception {
		saveUser();
		Cookie pending = pendingCookie(login());

		mockMvc.perform(get("/api/auth/me").cookie(new Cookie(SESSION_COOKIE, pending.getValue())))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(get("/api/auth/me").cookie(pending)).andExpect(status().isUnauthorized());
	}
}
