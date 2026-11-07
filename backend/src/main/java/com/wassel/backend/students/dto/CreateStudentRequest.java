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
		String firstName,

		@NotBlank(message = "Last name is required")
		String lastName,

		@NotBlank(message = "Grade is required")
		String grade,

		@NotBlank(message = "Guardian name is required")
		String guardianName,

		@NotBlank(message = "Guardian phone is required")
		@Pattern(regexp = "^\\+961 \\d{1,2} \\d{3} \\d{3}$",
				message = "Use a format like \"+961 3 123 456\" or \"+961 70 234 567\"")
		String guardianPhone,

		@Size(max = 255, message = "Address must be 255 characters or fewer")
		String address) {

	// Trims before the @Pattern check runs, so surrounding whitespace doesn't fail validation.
	public CreateStudentRequest {
		firstName = firstName == null ? null : firstName.trim();
		lastName = lastName == null ? null : lastName.trim();
		grade = grade == null ? null : grade.trim();
		guardianName = guardianName == null ? null : guardianName.trim();
		guardianPhone = guardianPhone == null ? null : guardianPhone.trim();
		address = normalizeAddress(address);
	}

	// Blank is "not given", not a validation error, since the field is optional.
	private static String normalizeAddress(String address) {
		if (address == null) {
			return null;
		}
		String trimmed = address.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}
}
