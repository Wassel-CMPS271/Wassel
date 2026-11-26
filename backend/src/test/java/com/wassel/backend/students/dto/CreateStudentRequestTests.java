package com.wassel.backend.students.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.TreeMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-299 and SCRUM-300: single create answers a too-long value with a field error instead of a database error, a blank
 * phone gets one message, and the trim also removes non-breaking spaces and a byte-order mark.
 */
class CreateStudentRequestTests {

	private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

	private static CreateStudentRequest request(String first, String last, String grade, String guardian,
			String phone) {
		return new CreateStudentRequest(first, last, grade, guardian, phone, null);
	}

	private static Map<String, String> errors(CreateStudentRequest request) {
		Map<String, String> errors = new TreeMap<>();
		for (ConstraintViolation<CreateStudentRequest> violation : VALIDATOR.validate(request)) {
			String previous = errors.put(violation.getPropertyPath().toString(), violation.getMessage());
			assertEquals(null, previous, "two messages for " + violation.getPropertyPath());
		}
		return errors;
	}

	@Test
	void theLongestValuesTheColumnsHoldAreAccepted() {
		assertTrue(errors(request("a".repeat(100), "b".repeat(100), "c".repeat(50), "d".repeat(100),
				"+961 70 234 567")).isEmpty());
	}

	@Test
	void oneCharacterOverEachColumnIsAFieldErrorNamingTheLimit() {
		assertEquals(Map.of("firstName", "First name must be 100 characters or fewer"),
				errors(request("a".repeat(101), "B", "G", "G", "+961 3 123 456")));
		assertEquals(Map.of("lastName", "Last name must be 100 characters or fewer"),
				errors(request("A", "b".repeat(101), "G", "G", "+961 3 123 456")));
		assertEquals(Map.of("grade", "Grade must be 50 characters or fewer"),
				errors(request("A", "B", "c".repeat(51), "G", "+961 3 123 456")));
		assertEquals(Map.of("guardianName", "Guardian name must be 100 characters or fewer"),
				errors(request("A", "B", "G", "d".repeat(101), "+961 3 123 456")));
	}

	@Test
	void aVeryLongPhoneIsOnlyTheFormatMessage() {
		assertEquals(1, errors(request("A", "B", "G", "G", "+961 3 123 456" + "7".repeat(100))).size());
	}

	@Test
	void aBlankPhoneIsOnlyRequired() {
		for (String blank : new String[] { null, "", "   ", " " }) {
			assertEquals(Map.of("guardianPhone", "Guardian phone is required"),
					errors(request("A", "B", "G", "G", blank)), String.valueOf(blank));
		}
	}

	@Test
	void aWrongPhoneIsTheFormatMessage() {
		assertEquals(Map.of("guardianPhone", "Use a format like \"+961 3 123 456\" or \"+961 70 234 567\""),
				errors(request("A", "B", "G", "G", "03 123 456")));
	}

	@Test
	void theTrimRemovesNonBreakingSpacesAndAByteOrderMark() {
		CreateStudentRequest cleaned = request("﻿Nour ", " Haddad ", " Grade 3", "G ",
				" +961 3 123 456 ");
		assertEquals("Nour", cleaned.firstName());
		assertEquals("Haddad", cleaned.lastName());
		assertEquals("Grade 3", cleaned.grade());
		assertEquals("G", cleaned.guardianName());
		assertEquals("+961 3 123 456", cleaned.guardianPhone());
		assertTrue(errors(cleaned).isEmpty());
	}

	@Test
	void aNameOfOnlyNonBreakingSpacesIsRequired() {
		assertEquals(Map.of("firstName", "First name is required"),
				errors(request("  ", "B", "G", "G", "+961 3 123 456")));
	}
}
