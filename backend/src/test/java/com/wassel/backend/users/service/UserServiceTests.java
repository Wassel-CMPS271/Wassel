package com.wassel.backend.users.service;

import com.wassel.backend.auth.dto.LoginRequest;
import com.wassel.backend.auth.service.AuthService;
import com.wassel.backend.auth.service.Mailer;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.exception.EmailAlreadyInUseException;
import com.wassel.backend.users.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;

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

	@MockitoBean
	private Mailer mailer;

	@BeforeEach
	void cleanDatabase() {
		userRepository.deleteAll();
	}

	/** Both steps of a login: the password, then the emailed code. */
	private Role roleAfterSigningIn(String email, String password) {
		String pending = authService.login(new LoginRequest(email, password));
		ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
		verify(mailer, atLeastOnce()).send(anyString(), anyString(), body.capture());
		Matcher code = Pattern.compile("\\b(\\d{6})\\b").matcher(body.getValue());
		assertTrue(code.find(), "no code in the email");
		return authService.completeLogin(pending, code.group(1)).user().role();
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
		assertEquals(Role.DRIVER, roleAfterSigningIn("new@wassel.test", "a-long-enough-password"));
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

		assertEquals(Role.ADMIN, roleAfterSigningIn("new.admin@wassel.test", "a-long-enough-password"));
	}
}
