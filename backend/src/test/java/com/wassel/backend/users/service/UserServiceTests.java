package com.wassel.backend.users.service;

import com.wassel.backend.auth.dto.LoginRequest;
import com.wassel.backend.auth.service.AuthService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.exception.EmailAlreadyInUseException;
import com.wassel.backend.users.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
	void createInvitedUserStoresTheNoPasswordMarkerAndNormalisesTheEmail() {
		UUID school = UUID.randomUUID();

		User user = userService.createInvitedUser("  New.Parent@Wassel.TEST ", Role.PARENT, school);

		assertEquals("new.parent@wassel.test", user.getEmail());
		assertEquals(Role.PARENT, user.getRole());
		assertEquals(school, user.getSchoolId());
		assertTrue(user.isEnabled());
		assertEquals(User.NO_PASSWORD_HASH, user.getPasswordHash());
		assertFalse(user.hasPassword());
	}

	@Test
	void createInvitedUserRejectsAnEmailAlreadyUsedInAnotherSchoolAndCase() {
		userService.createUser("taken@wassel.test", "a-long-enough-password", Role.ADMIN, UUID.randomUUID());

		assertThrows(EmailAlreadyInUseException.class,
				() -> userService.createInvitedUser(" TAKEN@wassel.test", Role.PARENT, UUID.randomUUID()));
		assertEquals(1, userRepository.count());
	}

	@Test
	void setPasswordLetsAnInvitedUserSignIn() {
		User user = userService.createInvitedUser("new@wassel.test", Role.DRIVER, UUID.randomUUID());

		userService.setPassword(user.getId(), "a-long-enough-password");

		assertTrue(userService.findById(user.getId()).orElseThrow().hasPassword());
		assertEquals(Role.DRIVER,
				authService.login(new LoginRequest("new@wassel.test", "a-long-enough-password")).user().role());
	}

	@Test
	void listByRoleReturnsOnlyThatSchoolsUsersOfThatRoleOldestFirst() {
		UUID school = UUID.randomUUID();
		userService.createInvitedUser("first@wassel.test", Role.PARENT, school);
		userService.createInvitedUser("second@wassel.test", Role.PARENT, school);
		userService.createInvitedUser("driver@wassel.test", Role.DRIVER, school);
		userService.createInvitedUser("other@wassel.test", Role.PARENT, UUID.randomUUID());

		assertEquals(List.of("first@wassel.test", "second@wassel.test"),
				userService.listByRole(school, Role.PARENT).stream().map(User::getEmail).toList());
	}

	@Test
	void anAccountMadeByCreateUserCanSignIn() {
		userService.createUser("New.Admin@Wassel.TEST", "a-long-enough-password", Role.ADMIN, UUID.randomUUID());

		assertEquals(Role.ADMIN,
				authService.login(new LoginRequest("new.admin@wassel.test", "a-long-enough-password")).user().role());
	}
}
