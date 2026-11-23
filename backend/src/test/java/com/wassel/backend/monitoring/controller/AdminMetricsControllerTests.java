package com.wassel.backend.monitoring.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-290 through the real security chain: only the admin reads the numbers, they match a scripted run, and the
 * health check stays the only open actuator path (HealthEndpointTests).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminMetricsControllerTests {

	private static final String METRICS = "/api/admin/metrics";

	@Autowired
	private MockMvc mockMvc;

	private static RequestPostProcessor as(Role role) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test").passwordHash("x").role(role)
				.schoolId(UUID.randomUUID()).build();
		return authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))));
	}

	private String read() throws Exception {
		return mockMvc.perform(get(METRICS).with(as(Role.ADMIN))).andExpect(status().isOk()).andReturn().getResponse()
				.getContentAsString();
	}

	private static long number(String json, String path) {
		return ((Number) JsonPath.read(json, path)).longValue();
	}

	@Test
	void onlyTheAdminMayReadIt() throws Exception {
		mockMvc.perform(get(METRICS).with(as(Role.ADMIN))).andExpect(status().isOk());
		for (Role role : List.of(Role.HEAD_OF_TRANSPORT, Role.DRIVER, Role.PARENT)) {
			mockMvc.perform(get(METRICS).with(as(role))).andExpect(status().isForbidden());
		}
		mockMvc.perform(get(METRICS)).andExpect(status().isUnauthorized());
	}

	@Test
	void itIsReadOnly() throws Exception {
		mockMvc.perform(post(METRICS).with(as(Role.ADMIN)).contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().is4xxClientError());
	}

	@Test
	void theAnswerHasEveryCounterAndSaysItResetsOnRestart() throws Exception {
		mockMvc.perform(get(METRICS).with(as(Role.ADMIN)))
				.andExpect(jsonPath("$.since").isString())
				.andExpect(jsonPath("$.resetsOnRestart").value(true))
				.andExpect(jsonPath("$.requests.total").isNumber())
				.andExpect(jsonPath("$.requests.serverErrors").isNumber())
				.andExpect(jsonPath("$.requests.tooManyRequests").isNumber())
				.andExpect(jsonPath("$.requests.latencySample").isNumber())
				.andExpect(jsonPath("$.signIns.failed").isNumber())
				.andExpect(jsonPath("$.signIns.lockouts").isNumber())
				.andExpect(jsonPath("$.notifications.sent").isNumber())
				.andExpect(jsonPath("$.notifications.failed").isNumber());
	}

	@Test
	void theNumbersMatchAScriptedRun() throws Exception {
		String before = read();

		// 3 requests with no session (401 each) and 2 sign-ins with an unknown account (401 each, so 2 failed sign-ins).
		for (int i = 0; i < 3; i++) {
			mockMvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
		}
		for (int i = 0; i < 2; i++) {
			mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
							.content("{\"email\":\"nobody@wassel.test\",\"password\":\"not-a-real-password\"}"))
					.andExpect(status().isUnauthorized());
		}

		String after = read();
		assertEquals(5, number(after, "$.requests.total") - number(before, "$.requests.total"));
		assertEquals(2, number(after, "$.signIns.failed") - number(before, "$.signIns.failed"));
		assertEquals(0, number(after, "$.requests.serverErrors") - number(before, "$.requests.serverErrors"));
		assertEquals(0, number(after, "$.requests.tooManyRequests") - number(before, "$.requests.tooManyRequests"));
		// Reading the numbers is not counted, so reading twice changes nothing.
		assertEquals(number(after, "$.requests.total"), number(read(), "$.requests.total"));
	}

	@Test
	void noOtherActuatorEndpointIsOpenToTheAdminEither() throws Exception {
		mockMvc.perform(get("/actuator/metrics").with(as(Role.ADMIN))).andExpect(status().is4xxClientError());
		mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
	}
}
