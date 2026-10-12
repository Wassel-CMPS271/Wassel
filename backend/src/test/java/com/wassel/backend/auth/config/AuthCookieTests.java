package com.wassel.backend.auth.config;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;

class AuthCookieTests {

	private static final String SECRET = "0123456789abcdef0123456789abcdef";

	private AuthCookie cookie(boolean secure) {
		return new AuthCookie(new JwtProperties(SECRET, Duration.ofHours(1), secure));
	}

	@Test
	void theCookieIsHttpsOnlyWhenConfiguredSo() {
		assertThat(cookie(true).create("t").toString(), containsString("Secure"));
		assertThat(cookie(false).create("t").toString(), not(containsString("Secure")));
	}

	@Test
	void thePendingCookieCarriesTheSameProtectionsAndLastsFifteenMinutes() {
		String pending = cookie(true).createPending("t").toString();

		assertThat(pending, containsString("wassel_2fa=t"));
		assertThat(pending, containsString("HttpOnly"));
		assertThat(pending, containsString("SameSite=Strict"));
		assertThat(pending, containsString("Secure"));
		assertThat(pending, containsString("Max-Age=900"));
		assertThat(cookie(false).createPending("t").toString(), not(containsString("Secure")));
	}

	@Test
	void clearingThePendingCookieKeepsTheSamePathAndFlags() {
		String cleared = cookie(true).clearPending().toString();

		assertThat(cleared, containsString("wassel_2fa=;"));
		assertThat(cleared, containsString("Path=/"));
		assertThat(cleared, containsString("HttpOnly"));
		assertThat(cleared, containsString("SameSite=Strict"));
		assertThat(cleared, containsString("Secure"));
		assertThat(cleared, containsString("Max-Age=0"));
	}

	@Test
	void clearingKeepsTheSamePathAndFlagsSoTheBrowserActuallyDeletesIt() {
		String cleared = cookie(true).clear().toString();

		assertThat(cleared, containsString("Path=/"));
		assertThat(cleared, containsString("HttpOnly"));
		assertThat(cleared, containsString("SameSite=Strict"));
		assertThat(cleared, containsString("Secure"));
		assertThat(cleared, containsString("Max-Age=0"));
	}
}
