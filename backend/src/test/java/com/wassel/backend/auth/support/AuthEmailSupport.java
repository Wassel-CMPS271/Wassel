package com.wassel.backend.auth.support;

import com.wassel.backend.auth.repository.LoginCodeRepository;
import com.wassel.backend.auth.repository.PasswordTokenRepository;
import com.wassel.backend.inbox.service.RecordingMailer;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * The auth email tests (SCRUM-289): real PostgreSQL, the real HTTP layer, and a {@link RecordingMailer} for the mail
 * provider, the one thing outside our code. Users are made with a random address, so a test never meets another's rows.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(RecordingMailer.Config.class)
public abstract class AuthEmailSupport {

	protected static final String PASSWORD = "correct-horse-battery";

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

	private static final Pattern TOKEN = Pattern.compile("token=([\\w-]+)");

	protected final UUID school = UUID.randomUUID();

	@Autowired
	protected MockMvc mockMvc;

	@Autowired
	protected UserRepository userRepository;

	@Autowired
	protected LoginCodeRepository codeRepository;

	@Autowired
	protected PasswordTokenRepository tokenRepository;

	@Autowired
	protected PasswordEncoder passwordEncoder;

	@Autowired
	protected JdbcTemplate jdbc;

	@Autowired
	protected RecordingMailer mailer;

	@BeforeEach
	void aCleanSlate() {
		mailer.reset();
		codeRepository.deleteAll();
		tokenRepository.deleteAll();
	}

	protected User saveUser() {
		return userRepository.save(User.builder().email(UUID.randomUUID() + "@wassel.test")
				.passwordHash(passwordEncoder.encode(PASSWORD)).role(Role.PARENT).schoolId(school).build());
	}

	protected MvcResult login(User user) throws Exception {
		return mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(user.getEmail(), PASSWORD))).andReturn();
	}

	protected MvcResult resend(Cookie pending) throws Exception {
		return mockMvc.perform(post("/api/auth/2fa/resend").cookie(pending)).andReturn();
	}

	protected MvcResult verifyCode(Cookie pending, String code) throws Exception {
		return mockMvc.perform(post("/api/auth/2fa/verify").cookie(pending).contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"%s\"}".formatted(code))).andReturn();
	}

	protected MvcResult forgotPassword(String email) throws Exception {
		return mockMvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\"}".formatted(email))).andReturn();
	}

	protected static Cookie pendingCookie(MvcResult login) {
		String header = login.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream()
				.filter(candidate -> candidate.startsWith("wassel_2fa=")).findFirst().orElseThrow();
		return new Cookie("wassel_2fa", header.substring("wassel_2fa=".length(), header.indexOf(';')));
	}

	/** The six digits of the newest email the provider was given. */
	protected String lastCode() {
		var sent = mailer.sent();
		Matcher matcher = CODE.matcher(sent.get(sent.size() - 1).body());
		assertTrue(matcher.find(), "no code in the email");
		return matcher.group(1);
	}

	/** The token in the newest link email. */
	protected String lastToken() {
		var sent = mailer.sent();
		Matcher matcher = TOKEN.matcher(sent.get(sent.size() - 1).body());
		assertTrue(matcher.find(), "no link in the email");
		return matcher.group(1);
	}

	/** The cooldown is 60 s; the tests age a row instead of waiting. */
	protected void ageCode(User user) {
		jdbc.update("update login_codes set sent_at = sent_at - interval '2 minutes' where user_id = ?", user.getId());
	}

	protected void ageTokens(User user) {
		jdbc.update("update password_tokens set created_at = created_at - interval '2 minutes' where user_id = ?",
				user.getId());
	}

	protected int codeRows(User user) {
		return jdbc.queryForObject("select count(*) from login_codes where user_id = ?", Integer.class, user.getId());
	}

	protected int unusedTokens(User user) {
		return jdbc.queryForObject("select count(*) from password_tokens where user_id = ? and used_at is null",
				Integer.class, user.getId());
	}

	protected int authEmailRows(User user, String kind) {
		return jdbc.queryForObject("select count(*) from auth_emails where user_id = ? and kind = ?", Integer.class,
				user.getId(), kind);
	}
}
