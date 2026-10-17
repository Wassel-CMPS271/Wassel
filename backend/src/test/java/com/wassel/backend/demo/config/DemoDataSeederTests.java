package com.wassel.backend.demo.config;

import com.wassel.backend.demo.service.DemoDataService;
import com.wassel.backend.users.service.UserService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.DefaultApplicationArguments;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DemoDataSeederTests {

	private static final UUID SCHOOL = UUID.randomUUID();

	private static final String PASSWORD = "a-long-enough-demo-password";

	private final UserService userService = mock(UserService.class);

	private final DemoDataService demoDataService = mock(DemoDataService.class);

	private void run(String password, boolean force) {
		new DemoDataSeeder(userService, demoDataService, password, force, SCHOOL, "admin@wassel.test")
				.run(new DefaultApplicationArguments());
	}

	@Test
	void seedsAnEmptyDatabase() {
		when(userService.existsOtherThan(any())).thenReturn(false);

		run(PASSWORD, false);

		verify(demoDataService).seed(SCHOOL, PASSWORD);
	}

	@Test
	void doesNothingWhenTheDatabaseHasOtherAccounts() {
		when(userService.existsOtherThan(any())).thenReturn(true);

		run(PASSWORD, false);

		verify(demoDataService, never()).seed(any(), any());
	}

	@Test
	void seedsDespiteOtherAccountsWhenForced() {
		when(userService.existsOtherThan(any())).thenReturn(true);

		run(PASSWORD, true);

		verify(demoDataService).seed(SCHOOL, PASSWORD);
	}

	@Test
	void theGuardIgnoresTheDemoAccountsAndTheSeededAdmin() {
		when(demoDataService.demoEmails()).thenReturn(List.of("demo+head@wassel.test"));
		when(userService.existsOtherThan(any())).thenReturn(false);

		run(PASSWORD, false);

		@SuppressWarnings("unchecked")
		ArgumentCaptor<Collection<String>> allowed = ArgumentCaptor.forClass(Collection.class);
		verify(userService).existsOtherThan(allowed.capture());
		assertTrue(allowed.getValue().containsAll(List.of("demo+head@wassel.test", "admin@wassel.test")));
	}

	@Test
	void refusesToStartWithAShortOrMissingPassword() {
		assertThrows(IllegalStateException.class, () -> run("", false));
		assertThrows(IllegalStateException.class, () -> run("short", false));
		verify(demoDataService, never()).seed(any(), any());
	}
}
