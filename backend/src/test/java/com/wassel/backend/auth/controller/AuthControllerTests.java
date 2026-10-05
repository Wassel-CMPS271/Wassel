package com.wassel.backend.auth.controller;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthControllerTests {

	private static final String COOKIE = "wassel_token";

	private static final String PASSWORD = "correct-horse-battery";

	private static final String BAD_LOGIN_DETAIL = "Invalid email or password.";

	private final UUID school = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@BeforeEach
	void cleanDatabase() {
		userRepository.deleteAll();
	}

	private User saveUser(String email, Role role, boolean enabled) {
		return userRepository.save(User.builder().email(email).passwordHash(passwordEncoder.encode(PASSWORD))
				.role(role).schoolId(school).enabled(enabled).build());
	}

	private MvcResult login(String email, String password) throws Exception {
		return mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))).andReturn();
	}

	private String loginAndGetToken(String email) throws Exception {
		MvcResult result = login(email, PASSWORD);
		assertEquals(200, result.getResponse().getStatus());
		String header = result.getResponse().getHeader(HttpHeaders.SET_COOKIE);
		return header.substring((COOKIE + "=").length(), header.indexOf(';'));
	}

	private void assertGenericLoginFailure(String email, String password) throws Exception {
		mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.detail").value(BAD_LOGIN_DETAIL))
				.andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
	}

	@Test
	void loginReturnsTheUserAndSetsAnHttpOnlyStrictCookie() throws Exception {
		User user = saveUser("hot@wassel.test", Role.HEAD_OF_TRANSPORT, true);

		mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"hot@wassel.test\",\"password\":\"%s\"}".formatted(PASSWORD)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(user.getId().toString()))
				.andExpect(jsonPath("$.email").value("hot@wassel.test"))
				.andExpect(jsonPath("$.role").value("HEAD_OF_TRANSPORT"))
				.andExpect(jsonPath("$.schoolId").value(school.toString()))
				.andExpect(jsonPath("$.token").doesNotExist())
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString(COOKIE + "=")))
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("HttpOnly")))
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("SameSite=Strict")))
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Path=/")))
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=3600")))
				.andExpect(header().string(HttpHeaders.SET_COOKIE, not(containsString("Secure"))));
	}

	@Test
	void emailMatchingIgnoresCaseAndSurroundingSpaces() throws Exception {
		saveUser("hot@wassel.test", Role.HEAD_OF_TRANSPORT, true);

		assertEquals(200, login("  HoT@Wassel.TEST ", PASSWORD).getResponse().getStatus());
	}

	@Test
	void aWrongPasswordIsUnauthorized() throws Exception {
		saveUser("hot@wassel.test", Role.HEAD_OF_TRANSPORT, true);

		assertGenericLoginFailure("hot@wassel.test", "wrong-password");
	}

	@Test
	void anUnknownEmailFailsExactlyLikeAWrongPassword() throws Exception {
		assertGenericLoginFailure("nobody@wassel.test", PASSWORD);
	}

	@Test
	void aDisabledAccountFailsExactlyLikeAWrongPasswordEvenWithTheRightPassword() throws Exception {
		saveUser("off@wassel.test", Role.PARENT, false);

		assertGenericLoginFailure("off@wassel.test", PASSWORD);
	}

	@Test
	void anInvitedAccountWithNoPasswordFailsExactlyLikeAWrongPassword() throws Exception {
		userRepository.save(User.builder().email("new@wassel.test").passwordHash(User.NO_PASSWORD_HASH)
				.role(Role.PARENT).schoolId(school).build());

		assertGenericLoginFailure("new@wassel.test", PASSWORD);
		assertGenericLoginFailure("new@wassel.test", User.NO_PASSWORD_HASH);
		// The password AuthService hashes for unknown emails must not open an invited account either.
		assertGenericLoginFailure("new@wassel.test", "not-a-real-password");
	}

	@Test
	void blankFieldsAreRejectedWithFieldErrors() throws Exception {
		mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"\",\"password\":\"\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").value("Email is required"))
				.andExpect(jsonPath("$.errors.password").value("Password is required"));
	}

	@Test
	void aStaleOrGarbageCookieNeverBlocksSigningInAgain() throws Exception {
		saveUser("hot@wassel.test", Role.HEAD_OF_TRANSPORT, true);

		mockMvc.perform(post("/api/auth/login").cookie(new Cookie(COOKIE, "garbage"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"hot@wassel.test\",\"password\":\"%s\"}".formatted(PASSWORD)))
				.andExpect(status().isOk());
	}

	@Test
	void meReturnsTheSignedInUserFromTheCookie() throws Exception {
		User user = saveUser("par@wassel.test", Role.PARENT, true);
		String token = loginAndGetToken("par@wassel.test");

		mockMvc.perform(get("/api/auth/me").cookie(new Cookie(COOKIE, token)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(user.getId().toString()))
				.andExpect(jsonPath("$.role").value("PARENT"));
	}

	@Test
	void meWithoutACookieIsUnauthorized() throws Exception {
		mockMvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
	}

	@Test
	void meWithAGarbageCookieIsUnauthorized() throws Exception {
		mockMvc.perform(get("/api/auth/me").cookie(new Cookie(COOKIE, "garbage")))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void aValidTokenForAUserWhoNoLongerExistsIsUnauthorized() throws Exception {
		User user = saveUser("par@wassel.test", Role.PARENT, true);
		String token = loginAndGetToken("par@wassel.test");
		userRepository.deleteById(user.getId());

		mockMvc.perform(get("/api/auth/me").cookie(new Cookie(COOKIE, token)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void disablingAnAccountCutsOffItsExistingToken() throws Exception {
		User user = saveUser("par@wassel.test", Role.PARENT, true);
		String token = loginAndGetToken("par@wassel.test");
		user.setEnabled(false);
		userRepository.save(user);

		mockMvc.perform(get("/api/auth/me").cookie(new Cookie(COOKIE, token)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void aRoleChangeTakesEffectImmediatelyNotWhenTheTokenExpires() throws Exception {
		User user = saveUser("par@wassel.test", Role.PARENT, true);
		String token = loginAndGetToken("par@wassel.test");
		user.setRole(Role.ADMIN);
		userRepository.save(user);

		mockMvc.perform(get("/api/auth/me").cookie(new Cookie(COOKIE, token)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.role").value("ADMIN"));
	}

	@Test
	void theCookieAuthenticatesRoleProtectedEndpoints() throws Exception {
		saveUser("hot@wassel.test", Role.HEAD_OF_TRANSPORT, true);
		String token = loginAndGetToken("hot@wassel.test");

		mockMvc.perform(get("/api/head-of-transport/vehicles").cookie(new Cookie(COOKIE, token)))
				.andExpect(status().isOk());
	}

	@Test
	void aSignedInUserWithTheWrongRoleIsForbidden() throws Exception {
		saveUser("par@wassel.test", Role.PARENT, true);
		String token = loginAndGetToken("par@wassel.test");

		mockMvc.perform(get("/api/head-of-transport/vehicles").cookie(new Cookie(COOKIE, token)))
				.andExpect(status().isForbidden());
	}

	@Test
	void logoutClearsTheCookieEvenWhenNotSignedIn() throws Exception {
		mockMvc.perform(post("/api/auth/logout"))
				.andExpect(status().isNoContent())
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString(COOKIE + "=;")))
				.andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));
	}

	@Test
	void theFrontendOriginMayCallTheApiWithCredentials() throws Exception {
		mockMvc.perform(options("/api/auth/login").header(HttpHeaders.ORIGIN, "http://localhost:3000")
						.header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
						.header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type"))
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:3000"))
				.andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
	}

	@Test
	void anyOtherOriginIsRefused() throws Exception {
		mockMvc.perform(options("/api/auth/login").header(HttpHeaders.ORIGIN, "http://evil.example")
						.header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
				.andExpect(status().isForbidden());
	}
}
