package com.wassel.backend.auth.service;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.client.RestClient;

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
				.withBean(RestClient.Builder.class, RestClient::builder)
				.withUserConfiguration(LoggingMailer.class, SmtpMailer.class, BrevoMailer.class)
				.withInitializer(context -> context.getEnvironment().setActiveProfiles(profiles));
	}

	@Test
	void localAndTestPrintTheEmailInsteadOfSendingIt() {
		for (String profile : new String[] { "local", "test" }) {
			runWith(profile).run(context -> assertThat(context)
					.hasSingleBean(Mailer.class).hasSingleBean(LoggingMailer.class).doesNotHaveBean(SmtpMailer.class));
		}
	}

	private static final String[] BREVO = { "wassel.mail.provider=brevo", "wassel.mail.brevo.api-key=test-key-not-real",
			"wassel.mail.brevo.sender-email=sender@example.test" };

	// "smtp" is also what you get when the setting is absent, so existing setups keep working.
	@Test
	void theProviderSettingPicksBetweenSmtpAndBrevoNeverBoth() {
		runWith("staging").withPropertyValues("wassel.mail.provider=smtp").run(context -> assertThat(context)
				.hasSingleBean(Mailer.class).hasSingleBean(SmtpMailer.class).doesNotHaveBean(BrevoMailer.class));
		runWith("staging").withPropertyValues(BREVO).run(context -> assertThat(context)
				.hasSingleBean(Mailer.class).hasSingleBean(BrevoMailer.class).doesNotHaveBean(SmtpMailer.class));
		runWith().withPropertyValues(BREVO).run(context -> assertThat(context)
				.hasSingleBean(Mailer.class).hasSingleBean(BrevoMailer.class).doesNotHaveBean(SmtpMailer.class));
	}

	// Choosing Brevo never turns on printing: local and test stay on LoggingMailer whatever the setting.
	@Test
	void localAndTestPrintTheEmailEvenWhenBrevoIsChosen() {
		for (String profile : new String[] { "local", "test" }) {
			runWith(profile).withPropertyValues(BREVO).run(context -> assertThat(context)
					.hasSingleBean(Mailer.class).hasSingleBean(LoggingMailer.class).doesNotHaveBean(BrevoMailer.class)
					.doesNotHaveBean(SmtpMailer.class));
		}
	}

	@Test
	void brevoWithoutAKeyOrASenderFailsToStart() {
		runWith("staging").withPropertyValues("wassel.mail.provider=brevo", "wassel.mail.brevo.api-key=",
				"wassel.mail.brevo.sender-email=sender@example.test").run(context -> assertThat(context).hasFailed());
		runWith("staging").withPropertyValues("wassel.mail.provider=brevo", "wassel.mail.brevo.api-key=test-key-not-real",
				"wassel.mail.brevo.sender-email=").run(context -> assertThat(context).hasFailed());
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
