package com.wassel.backend.common.config;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-285: the health check is the one open actuator endpoint. It must answer without a session, say only UP
 * or DOWN, and be the only actuator endpoint anyone can reach, even a signed-in admin.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HealthEndpointTests {

	@Autowired
	private MockMvc mockMvc;

	private RequestPostProcessor admin() {
		User user = User.builder().id(UUID.randomUUID()).email("admin@wassel.test").passwordHash("x")
				.role(Role.ADMIN).schoolId(UUID.randomUUID()).build();
		return authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
	}

	@Test
	void healthAnswersUpToAnyoneWithoutASession() throws Exception {
		mockMvc.perform(get("/actuator/health"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"));
	}

	@Test
	void healthSaysNothingBeyondUpOrDown() throws Exception {
		// No database name, disk sizes or component list: a stranger learns nothing about the deployment.
		mockMvc.perform(get("/actuator/health"))
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.components").doesNotExist())
				.andExpect(jsonPath("$.details").doesNotExist());
	}

	@Test
	void healthIsReadOnly() throws Exception {
		mockMvc.perform(post("/actuator/health")).andExpect(status().isUnauthorized());
	}

	@Test
	void noOtherActuatorEndpointIsReachableSignedOut() throws Exception {
		for (String path : new String[] { "/actuator", "/actuator/env", "/actuator/info", "/actuator/beans",
				"/actuator/heapdump", "/actuator/mappings", "/actuator/health/db" }) {
			mockMvc.perform(get(path)).andExpect(status().isUnauthorized());
		}
	}

	@Test
	void healthDoesNotDependOnTheMailServer() throws Exception {
		// Railway blocks outbound SMTP and Brevo needs none, so a mail check would be DOWN for good.
		mockMvc.perform(get("/actuator/health/mail")).andExpect(status().isUnauthorized());
		mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
	}

	@Test
	void aSignedInCallerAskingForAPathNobodyServesGetsA404NotA500() throws Exception {
		mockMvc.perform(get("/api/there-is-nothing-here").with(admin()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail").value("Not found"));
	}

	@Test
	void noOtherActuatorEndpointExistsEvenForAnAdmin() throws Exception {
		for (String path : new String[] { "/actuator/env", "/actuator/info", "/actuator/beans", "/actuator/heapdump",
				"/actuator/mappings", "/actuator/configprops", "/actuator/loggers" }) {
			mockMvc.perform(get(path).with(admin())).andExpect(status().isNotFound());
		}
	}
}
