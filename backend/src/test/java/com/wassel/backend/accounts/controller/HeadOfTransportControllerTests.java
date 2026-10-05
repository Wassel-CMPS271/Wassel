package com.wassel.backend.accounts.controller;

import com.wassel.backend.auth.service.Mailer;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HeadOfTransportControllerTests {

	private static final String URL = "/api/admin/head-of-transport";

	private final UUID school = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private UserService userService;

	@MockitoBean
	private Mailer mailer;

	@BeforeEach
	void cleanDatabase() {
		userRepository.deleteAll();
	}

	private RequestPostProcessor loggedInAs(Role role) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(school).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private String body(String email) {
		return "{\"email\":\"%s\"}".formatted(email);
	}

	@Test
	void adminCanInviteAHeadOfTransportIntoTheirOwnSchool() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN))
						.contentType(MediaType.APPLICATION_JSON).content(body("  Hot@Wassel.TEST ")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.email").value("hot@wassel.test"))
				.andExpect(jsonPath("$.status").value("invited"));

		User saved = userRepository.findByEmailIgnoreCase("hot@wassel.test").orElseThrow();
		assertEquals(Role.HEAD_OF_TRANSPORT, saved.getRole());
		assertEquals(school, saved.getSchoolId());
		verify(mailer, times(1)).send(eq("hot@wassel.test"), anyString(), contains("/set-password?token="));
	}

	@Test
	void theInvitedHeadOfTransportSetsAPasswordAndLogsIn() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN))
						.contentType(MediaType.APPLICATION_JSON).content(body("hot@wassel.test")))
				.andExpect(status().isCreated());
		ArgumentCaptor<String> mail = ArgumentCaptor.forClass(String.class);
		verify(mailer, atLeastOnce()).send(anyString(), anyString(), mail.capture());
		Matcher matcher = Pattern.compile("token=([\\w-]+)").matcher(mail.getValue());
		assertTrue(matcher.find());

		mockMvc.perform(post("/api/auth/password").contentType(MediaType.APPLICATION_JSON)
						.content("{\"token\":\"%s\",\"password\":\"a-brand-new-password\"}".formatted(matcher.group(1))))
				.andExpect(status().isNoContent());

		MvcResult login = mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"hot@wassel.test\",\"password\":\"a-brand-new-password\"}"))
				.andExpect(status().isNoContent()).andReturn();
		verify(mailer, atLeastOnce()).send(anyString(), anyString(), mail.capture());
		Matcher code = Pattern.compile("\\b(\\d{6})\\b").matcher(mail.getValue());
		assertTrue(code.find());

		mockMvc.perform(post("/api/auth/2fa/verify").cookie(login.getResponse().getCookie("wassel_2fa"))
						.contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"%s\"}".formatted(code.group(1))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.role").value("HEAD_OF_TRANSPORT"));
	}

	@Test
	void theEmailIsRequiredAndValidated() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN))
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").value("Email is required"));
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN))
						.contentType(MediaType.APPLICATION_JSON).content(body("not-an-email")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").value("Enter a valid email address"));

		assertEquals(0, userRepository.count());
	}

	@Test
	void anEmailAlreadyUsedIsAConflict() throws Exception {
		userService.createUser("hot@wassel.test", "a-long-enough-password", Role.PARENT, school);

		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN))
						.contentType(MediaType.APPLICATION_JSON).content(body("hot@wassel.test")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.email").value("An account with this email already exists."));

		assertEquals(1, userRepository.count());
	}

	@Test
	void nonAdminRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.HEAD_OF_TRANSPORT, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(post(URL).with(loggedInAs(role))
							.contentType(MediaType.APPLICATION_JSON).content(body("hot@wassel.test")))
					.andExpect(status().isForbidden());
		}
		assertEquals(0, userRepository.count());
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("hot@wassel.test")))
				.andExpect(status().isUnauthorized());
	}
}
