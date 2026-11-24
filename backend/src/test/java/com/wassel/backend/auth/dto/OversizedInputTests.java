package com.wassel.backend.auth.dto;

import com.wassel.backend.drivers.dto.CreateDriverRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-288: oversized input is a validation error (a 400 with the field named), never a 500 from the database or
 * from BCrypt. The limits are the columns' (email 255, names 100) and BCrypt's (72 bytes).
 */
class OversizedInputTests {

	private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

	private static String of(int length) {
		return "a".repeat(length);
	}

	private static String email(int length) {
		return of(length - "@example.com".length()) + "@example.com";
	}

	private static Set<String> fieldsOf(Object request) {
		return VALIDATOR.validate(request).stream().map(v -> v.getPropertyPath().toString()).collect(Collectors.toSet());
	}

	@Test
	void loginAcceptsTheLongestRealEmailAndPassword() {
		assertTrue(fieldsOf(new LoginRequest(email(255), of(72))).isEmpty());
	}

	@Test
	void loginRefusesAnEmailOverTheColumnAndAPasswordOverBcrypts72Bytes() {
		assertEquals(Set.of("email"), fieldsOf(new LoginRequest(email(256), "secret")));
		assertEquals(Set.of("password"), fieldsOf(new LoginRequest("a@b.co", of(73))));
		assertEquals(Set.of("email", "password"), fieldsOf(new LoginRequest(of(100_000) + "@b.co", of(100_000))));
	}

	@Test
	void theLoginPasswordLimitCountsBytesNotCharacters() {
		// 37 two-byte characters are 74 bytes.
		assertEquals(Set.of("password"), fieldsOf(new LoginRequest("a@b.co", "é".repeat(37))));
		assertTrue(fieldsOf(new LoginRequest("a@b.co", "é".repeat(36))).isEmpty());
	}

	@Test
	void forgotPasswordRefusesAnEmailOverTheColumn() {
		assertTrue(fieldsOf(new ForgotPasswordRequest(email(255))).isEmpty());
		assertEquals(Set.of("email"), fieldsOf(new ForgotPasswordRequest(email(256))));
		assertEquals(Set.of("email"), fieldsOf(new ForgotPasswordRequest(of(1_000_000))));
	}

	@Test
	void setPasswordRefusesATokenFarLongerThanARealOne() {
		assertTrue(fieldsOf(new SetPasswordRequest(of(43), "a-long-enough-password")).isEmpty());
		assertEquals(Set.of("token"), fieldsOf(new SetPasswordRequest(of(201), "a-long-enough-password")));
	}

	@Test
	void creatingADriverRefusesNamesAndEmailOverTheirColumns() {
		String phone = "+961 3 123 456";
		assertTrue(fieldsOf(new CreateDriverRequest(of(100), of(100), phone, email(255))).isEmpty());
		assertEquals(Set.of("firstName"), fieldsOf(new CreateDriverRequest(of(101), "Haddad", phone, "a@b.co")));
		assertEquals(Set.of("lastName"), fieldsOf(new CreateDriverRequest("Karim", of(101), phone, "a@b.co")));
		assertEquals(Set.of("email"), fieldsOf(new CreateDriverRequest("Karim", "Haddad", phone, email(256))));
	}
}
