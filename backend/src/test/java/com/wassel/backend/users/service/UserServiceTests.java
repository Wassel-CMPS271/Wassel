package com.wassel.backend.users.service;

import com.wassel.backend.auth.dto.LoginRequest;
import com.wassel.backend.auth.service.AuthService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
class UserServiceTests {

	@Autowired
	private UserService userService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@Autowired
	private AuthService authService;

	@BeforeEach
	void cleanDatabase() {
		userRepository.deleteAll();
	}

	@Test
	void createUserHashesThePasswordAndNormalisesTheEmail() {
		UUID school = UUID.randomUUID();

		User user = userService.createUser("  New.Admin@Wassel.TEST ", "a-long-enough-password", Role.ADMIN, school);

		assertEquals("new.admin@wassel.test", user.getEmail());
		assertEquals(Role.ADMIN, user.getRole());
		assertEquals(school, user.getSchoolId());
		assertTrue(user.isEnabled());
		assertNotEquals("a-long-enough-password", user.getPasswordHash());
		assertTrue(passwordEncoder.matches("a-long-enough-password", user.getPasswordHash()));
	}

	@Test
	void anAccountMadeByCreateUserCanSignIn() {
		userService.createUser("New.Admin@Wassel.TEST", "a-long-enough-password", Role.ADMIN, UUID.randomUUID());

		assertEquals(Role.ADMIN,
				authService.login(new LoginRequest("new.admin@wassel.test", "a-long-enough-password")).user().role());
	}
}
