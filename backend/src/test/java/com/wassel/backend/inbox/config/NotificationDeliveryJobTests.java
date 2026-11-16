package com.wassel.backend.inbox.config;

import com.wassel.backend.inbox.service.NotificationDeliveryService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SCRUM-283, "Switched off by default". No database: the sender job exists only when delivery is switched on (and never in
 * the {@code test} profile), and the settings refuse a cap under 1. The job needs the real service, which needs the whole
 * application, so "present" is shown by the context failing on that missing service: the job was registered.
 */
class NotificationDeliveryJobTests {

	@Configuration
	@EnableConfigurationProperties(NotificationDeliveryProperties.class)
	static class Properties {
	}

	private ApplicationContextRunner runner(String... profiles) {
		return new ApplicationContextRunner().withUserConfiguration(NotificationDeliveryJob.class)
				.withInitializer(context -> context.getEnvironment().setActiveProfiles(profiles));
	}

	@Test
	void theJobIsNotThereByDefaultOrWhenSwitchedOff() {
		runner("staging").run(context -> assertThat(context).hasNotFailed()
				.doesNotHaveBean(NotificationDeliveryJob.class));
		runner("staging").withPropertyValues("wassel.notifications.email.enabled=false")
				.run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(NotificationDeliveryJob.class));
	}

	@Test
	void theJobIsRegisteredWhenSwitchedOnOutsideTests() {
		runner("staging").withPropertyValues("wassel.notifications.email.enabled=true")
				.run(context -> assertThat(context).hasFailed().getFailure()
						.hasMessageContaining(NotificationDeliveryService.class.getName()));
	}

	@Test
	void theTestProfileNeverRunsTheJobEvenWhenSwitchedOn() {
		runner("test").withPropertyValues("wassel.notifications.email.enabled=true")
				.run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(NotificationDeliveryJob.class));
	}

	@Test
	void theSettingsDefaultToOffAnd150AndRefuseACapUnderOne() {
		new ApplicationContextRunner().withUserConfiguration(Properties.class).run(context -> {
			NotificationDeliveryProperties settings = context.getBean(NotificationDeliveryProperties.class);
			assertThat(settings.enabled()).isFalse();
			assertThat(settings.dailyCap()).isEqualTo(150);
		});
		new ApplicationContextRunner().withUserConfiguration(Properties.class)
				.withPropertyValues("wassel.notifications.email.daily-cap=0")
				.run(context -> assertThat(context).hasFailed());
	}
}
