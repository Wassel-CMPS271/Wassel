package com.wassel.backend.users.config;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Creates the first admin if its email has no account yet; never touches an existing account. */
@Slf4j
@Component
public class AdminSeeder implements ApplicationRunner {

	static final int MIN_PASSWORD_LENGTH = 10;

	private final UserService userService;

	private final String email;

	private final String password;

	private final UUID schoolId;

	public AdminSeeder(UserService userService, @Value("${wassel.seed-admin.email:}") String email,
			@Value("${wassel.seed-admin.password:}") String password,
			@Value("${wassel.seed-admin.school-id}") UUID schoolId) {
		this.userService = userService;
		this.email = email;
		this.password = password;
		this.schoolId = schoolId;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (email.isBlank() && password.isBlank()) {
			return;
		}
		if (email.isBlank() || password.isBlank()) {
			throw new IllegalStateException("ADMIN_EMAIL and ADMIN_PASSWORD must be set together");
		}
		if (password.length() < MIN_PASSWORD_LENGTH) {
			throw new IllegalStateException(
					"ADMIN_PASSWORD must be at least %d characters".formatted(MIN_PASSWORD_LENGTH));
		}
		if (userService.findByEmail(email).isPresent()) {
			return;
		}
		userService.createUser(email, password, Role.ADMIN, schoolId);
		log.info("Seeded admin account {}", email.trim());
	}
}
