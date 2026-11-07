package com.wassel.backend.demo.config;

import com.wassel.backend.demo.service.DemoDataService;
import com.wassel.backend.users.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Fills the demo school on startup when {@code wassel.demo.enabled} is true; the bean does not
 * exist otherwise. Unless {@code wassel.demo.force} is true it does nothing when the database has
 * any account other than the demo ones and the seeded admin, so it can't add demo data to a
 * database with real users.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "wassel.demo.enabled", havingValue = "true")
public class DemoDataSeeder implements ApplicationRunner {

	static final int MIN_PASSWORD_LENGTH = 10;

	private final UserService userService;

	private final DemoDataService demoDataService;

	private final String password;

	private final boolean force;

	private final UUID schoolId;

	private final String adminEmail;

	public DemoDataSeeder(UserService userService, DemoDataService demoDataService,
			@Value("${wassel.demo.password:}") String password, @Value("${wassel.demo.force:false}") boolean force,
			@Value("${wassel.seed-admin.school-id}") UUID schoolId,
			@Value("${wassel.seed-admin.email:}") String adminEmail) {
		this.userService = userService;
		this.demoDataService = demoDataService;
		this.password = password;
		this.force = force;
		this.schoolId = schoolId;
		this.adminEmail = adminEmail;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (password.length() < MIN_PASSWORD_LENGTH) {
			throw new IllegalStateException(
					"DEMO_PASSWORD must be at least %d characters when demo data is enabled".formatted(MIN_PASSWORD_LENGTH));
		}
		if (!force && userService.existsOtherThan(ownEmails())) {
			log.warn("Demo data is enabled but the database already has other accounts, so nothing was seeded. "
					+ "Set DEMO_DATA_FORCE=true to seed anyway.");
			return;
		}
		demoDataService.seed(schoolId, password);
	}

	private List<String> ownEmails() {
		List<String> emails = new ArrayList<>(demoDataService.demoEmails());
		if (!adminEmail.isBlank()) {
			emails.add(adminEmail);
		}
		return emails;
	}
}
