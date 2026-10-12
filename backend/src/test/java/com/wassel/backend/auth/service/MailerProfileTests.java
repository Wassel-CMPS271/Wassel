package com.wassel.backend.auth.service;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.mail.javamail.JavaMailSender;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Exactly one Mailer exists in every profile, and a deployed one never prints codes or links:
 * LoggingMailer is for local and test only, SmtpMailer is everything else.
 */
class MailerProfileTests {

	private ApplicationContextRunner runWith(String... profiles) {
		return new ApplicationContextRunner()
				.withBean(JavaMailSender.class, () -> mock(JavaMailSender.class))
				.withPropertyValues("spring.mail.username=wassel@example.test")
				.withUserConfiguration(LoggingMailer.class, SmtpMailer.class)
				.withInitializer(context -> context.getEnvironment().setActiveProfiles(profiles));
	}

	@Test
	void localAndTestPrintTheEmailInsteadOfSendingIt() {
		for (String profile : new String[] { "local", "test" }) {
			runWith(profile).run(context -> assertThat(context)
					.hasSingleBean(Mailer.class).hasSingleBean(LoggingMailer.class).doesNotHaveBean(SmtpMailer.class));
		}
	}

	@Test
	void stagingAndAnyOtherProfileSendRealEmail() {
		runWith("staging").run(context -> assertThat(context)
				.hasSingleBean(Mailer.class).hasSingleBean(SmtpMailer.class).doesNotHaveBean(LoggingMailer.class));
		runWith().run(context -> assertThat(context)
				.hasSingleBean(Mailer.class).hasSingleBean(SmtpMailer.class).doesNotHaveBean(LoggingMailer.class));
	}

	// A bare context resolves a missing placeholder leniently; the application registers this strict
	// configurer (Boot's PropertyPlaceholderAutoConfiguration), which is what makes startup fail.
	@Test
	void aDeployedProfileWithoutAMailAccountFailsToStart() {
		new ApplicationContextRunner()
				.withBean(PropertySourcesPlaceholderConfigurer.class)
				.withBean(JavaMailSender.class, () -> mock(JavaMailSender.class))
				.withUserConfiguration(SmtpMailer.class)
				.withInitializer(context -> context.getEnvironment().setActiveProfiles("staging"))
				.run(context -> assertThat(context).hasFailed());
	}
}
