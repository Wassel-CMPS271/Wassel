package com.wassel.backend.common.exception;

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

import java.util.List;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A path id that is not a UUID is the client's mistake: 400, not the catch-all 500. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MalformedPathVariableTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void aPathIdThatIsNotAUuidIsABadRequest() throws Exception {
		User head = User.builder().id(UUID.randomUUID()).email("head@wassel.test").passwordHash("x")
				.role(Role.HEAD_OF_TRANSPORT).schoolId(UUID.randomUUID()).build();

		mockMvc.perform(get("/api/head-of-transport/routes/not-a-uuid")
						.with(authentication(new UsernamePasswordAuthenticationToken(head, null,
								List.of(new SimpleGrantedAuthority("ROLE_HEAD_OF_TRANSPORT"))))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Invalid request parameter"));
	}
}
