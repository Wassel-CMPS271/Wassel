package com.wassel.backend.users.config;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminSeederTests {

	private static final UUID SCHOOL = UUID.randomUUID();

	private final UserService userService = mock(UserService.class);

	private void run(String email, String password) {
		new AdminSeeder(userService, email, password, SCHOOL).run(new DefaultApplicationArguments());
	}

	@Test
	void createsTheAdminWhenTheEmailHasNoAccount() {
		when(userService.findByEmail("admin@wassel.test")).thenReturn(Optional.empty());

		run("admin@wassel.test", "a-long-enough-password");

		verify(userService).createUser("admin@wassel.test", "a-long-enough-password", Role.ADMIN, SCHOOL);
	}

	@Test
	void leavesAnExistingAccountUntouched() {
		when(userService.findByEmail("admin@wassel.test")).thenReturn(Optional.of(mock(User.class)));

		run("admin@wassel.test", "a-long-enough-password");

		verify(userService, never()).createUser(any(), any(), any(), any());
	}

	@Test
	void doesNothingWhenNeitherIsConfigured() {
		run("", "");

		verify(userService, never()).createUser(any(), any(), any(), any());
	}

	@Test
	void refusesToStartWhenOnlyOneOfEmailAndPasswordIsSet() {
		assertThrows(IllegalStateException.class, () -> run("admin@wassel.test", ""));
		assertThrows(IllegalStateException.class, () -> run("", "a-long-enough-password"));
	}

	@Test
	void requiresAtLeastTenCharacters() {
		assertThrows(IllegalStateException.class, () -> run("admin@wassel.test", "123456789"));

		run("admin@wassel.test", "1234567890");

		verify(userService).createUser("admin@wassel.test", "1234567890", Role.ADMIN, SCHOOL);
	}
}
