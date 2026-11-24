package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.service.Mailer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-288 through the real security chain. The test profile turns the limit off (every test signs in from the same
 * address), so this class turns it on, with a small login limit.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
		"wassel.auth.rate-limit.enabled=true",
		"wassel.auth.rate-limit.limits.login=3",
		"wassel.auth.rate-limit.limits.forgot-password=2",
		"wassel.auth.rate-limit.trusted-proxy-hops=0"
})
class RateLimitTests {

	private static final String ORIGIN = "http://localhost:3000";

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private Mailer mailer;

	private static RequestPostProcessor from(String address) {
		return request -> {
			request.setRemoteAddr(address);
			return request;
		};
	}

	@Test
	void theFourthLoginFromOneAddressIsRefusedWithRetryAfterAndTheCorsHeadersTheBrowserNeeds() throws Exception {
		for (int i = 0; i < 3; i++) {
			mockMvc.perform(post("/api/auth/login").with(from("203.0.113.21")).contentType(MediaType.APPLICATION_JSON)
							.content("{\"email\":\"nobody@wassel.test\",\"password\":\"not-a-real-password\"}"))
					.andExpect(status().isUnauthorized());
		}
		mockMvc.perform(post("/api/auth/login").with(from("203.0.113.21")).header(HttpHeaders.ORIGIN, ORIGIN)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"nobody@wassel.test\",\"password\":\"not-a-real-password\"}"))
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists(HttpHeaders.RETRY_AFTER))
				.andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN))
				.andExpect(jsonPath("$.status").value(429))
				.andExpect(jsonPath("$.detail").value(containsString("Try again in")));
	}

	@Test
	void aForgedForwardedHeaderDoesNotBypassTheLimitAndAnotherAddressIsNotBlocked() throws Exception {
		for (int i = 0; i < 3; i++) {
			mockMvc.perform(post("/api/auth/login").with(from("203.0.113.22")).header("X-Forwarded-For", "198.51.100." + i)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"email\":\"nobody@wassel.test\",\"password\":\"not-a-real-password\"}"));
		}
		mockMvc.perform(post("/api/auth/login").with(from("203.0.113.22")).header("X-Forwarded-For", "198.51.100.99")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"nobody@wassel.test\",\"password\":\"not-a-real-password\"}"))
				.andExpect(status().isTooManyRequests());
		mockMvc.perform(post("/api/auth/login").with(from("203.0.113.23")).contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"nobody@wassel.test\",\"password\":\"not-a-real-password\"}"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void forgotPasswordHasItsOwnLimitAndAnswersLikeAnyOtherTooManyRequests() throws Exception {
		for (int i = 0; i < 2; i++) {
			mockMvc.perform(post("/api/auth/forgot-password").with(from("203.0.113.24"))
							.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nobody@wassel.test\"}"))
					.andExpect(status().isNoContent());
		}
		mockMvc.perform(post("/api/auth/forgot-password").with(from("203.0.113.24"))
						.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nobody@wassel.test\"}"))
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists(HttpHeaders.RETRY_AFTER));
	}

	@Test
	void anOversizedEmailOrPasswordIsA400WithTheFieldNamedNotA500() throws Exception {
		String huge = "a".repeat(100_000);
		mockMvc.perform(post("/api/auth/login").with(from("203.0.113.25")).contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"" + huge + "@wassel.test\",\"password\":\"" + huge + "\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").exists())
				.andExpect(jsonPath("$.errors.password").exists());
		mockMvc.perform(post("/api/auth/forgot-password").with(from("203.0.113.26"))
						.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + huge + "@wassel.test\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").exists());
	}

	@Test
	void everythingElseIsNotCounted() throws Exception {
		for (int i = 0; i < 10; i++) {
			mockMvc.perform(get("/api/auth/me").with(from("203.0.113.27"))).andExpect(status().isUnauthorized());
		}
	}
}
