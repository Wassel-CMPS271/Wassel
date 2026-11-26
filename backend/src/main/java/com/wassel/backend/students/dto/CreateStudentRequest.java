package com.wassel.backend.students.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The guardian phone must match the Lebanese format: {@code +961}, then a 1-2 digit prefix,
 * then two groups of 3 digits (e.g. {@code "+961 3 123 456"} or {@code "+961 70 234 567"}).
 *
 * <p>{@code address} is optional (SCRUM-213): omitted, null, or blank are all "no address yet",
 * the same as a student added without one and given it later through the update endpoint.
 */
public record CreateStudentRequest(
		@NotBlank(message = "First name is required")
		@Size(max = 100, message = "First name must be 100 characters or fewer")
		String firstName,

		@NotBlank(message = "Last name is required")
		@Size(max = 100, message = "Last name must be 100 characters or fewer")
		String lastName,

		@NotBlank(message = "Grade is required")
		@Size(max = 50, message = "Grade must be 50 characters or fewer")
		String grade,

		@NotBlank(message = "Guardian name is required")
		@Size(max = 100, message = "Guardian name must be 100 characters or fewer")
		String guardianName,

		@NotBlank(message = "Guardian phone is required")
		// An empty value passes the pattern, so "is required" is the only message a blank phone gets, whatever order
		// Bean Validation checks in. The pattern allows at most 15 characters, which is also the length limit.
		@Pattern(regexp = "^$|^\\+961 \\d{1,2} \\d{3} \\d{3}$",
				message = "Use a format like \"+961 3 123 456\" or \"+961 70 234 567\"")
		String guardianPhone,

		@Size(max = 255, message = "Address must be 255 characters or fewer")
		String address) {

	// Trims before the @Pattern check runs, so surrounding whitespace doesn't fail validation. The trim is CleanText's
	// (also non-breaking spaces and a leading byte-order mark), the same one an import row gets.
	public CreateStudentRequest {
		firstName = CleanText.of(firstName);
		lastName = CleanText.of(lastName);
		grade = CleanText.of(grade);
		guardianName = CleanText.of(guardianName);
		guardianPhone = CleanText.of(guardianPhone);
		address = normalizeAddress(address);
	}

	// Blank is "not given", not a validation error, since the field is optional.
	private static String normalizeAddress(String address) {
		if (address == null) {
			return null;
		}
		String trimmed = CleanText.of(address);
		return trimmed.isEmpty() ? null : trimmed;
	}
}
