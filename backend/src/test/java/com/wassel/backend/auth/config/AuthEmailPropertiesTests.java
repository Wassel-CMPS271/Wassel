package com.wassel.backend.auth.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/** SCRUM-289: a bad cap stops startup and names the variable to fix. */
class AuthEmailPropertiesTests {

	@EnableConfigurationProperties(AuthEmailProperties.class)
	static class Config {
	}

	private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(Config.class);

	@Test
	void theDefaultsAre120And30And10() {
		runner.run(context -> {
			AuthEmailProperties properties = context.getBean(AuthEmailProperties.class);
			assertThat(properties.dailyCap()).isEqualTo(120);
			assertThat(properties.resetDailyCap()).isEqualTo(30);
			assertThat(properties.perAccountDailyCap()).isEqualTo(10);
		});
	}

	@Test
	void aResetShareAboveTheDailyCapFailsToStart() {
		runner.withPropertyValues("wassel.auth.email.daily-cap=5", "wassel.auth.email.reset-daily-cap=6")
				.run(context -> assertThat(context).getFailure().rootCause().hasMessageContaining("AUTH_EMAIL_RESET_DAILY_CAP"));
	}

	@Test
	void aCapBelowOneFailsToStart() {
		runner.withPropertyValues("wassel.auth.email.daily-cap=0")
				.run(context -> assertThat(context).getFailure().rootCause().hasMessageContaining("AUTH_EMAIL_DAILY_CAP"));
		runner.withPropertyValues("wassel.auth.email.per-account-daily-cap=0")
				.run(context -> assertThat(context).getFailure().rootCause()
						.hasMessageContaining("AUTH_EMAIL_PER_ACCOUNT_DAILY_CAP"));
	}
}
