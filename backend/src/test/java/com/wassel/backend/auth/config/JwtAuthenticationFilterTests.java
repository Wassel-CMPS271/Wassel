package com.wassel.backend.auth.config;

import com.wassel.backend.auth.service.JwtService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

// A real HTTP port, because MockMvc doesn't re-dispatch filter exceptions to /error.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class JwtAuthenticationFilterTests {

	@LocalServerPort
	private int port;

	@MockitoBean
	private UserService userService;

	@Autowired
	private JwtService jwtService;

	@Test
	void aDatabaseFailureWhileLoadingTheUserIsAServerErrorNotALogout() throws Exception {
		User user = User.builder().id(UUID.randomUUID()).email("a@wassel.test").passwordHash("x").role(Role.ADMIN)
				.schoolId(UUID.randomUUID()).build();
		when(userService.findById(any())).thenThrow(new DataAccessResourceFailureException("db down"));

		HttpResponse<String> response = HttpClient.newHttpClient().send(
				HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/me"))
						.header("Cookie", AuthCookie.NAME + "=" + jwtService.generateToken(user)).build(),
				HttpResponse.BodyHandlers.ofString());

		assertEquals(500, response.statusCode());
	}
}
