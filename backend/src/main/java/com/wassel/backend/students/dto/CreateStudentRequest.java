package com.wassel.backend.students.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * The guardian phone must match the Lebanese format: {@code +961}, then a 1-2 digit prefix,
 * then two groups of 3 digits (e.g. {@code "+961 3 123 456"} or {@code "+961 70 234 567"}).
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
		String guardianPhone) {

	// Trims before the @Pattern check runs, so surrounding whitespace doesn't fail validation.
	public CreateStudentRequest {
		firstName = firstName == null ? null : firstName.trim();
		lastName = lastName == null ? null : lastName.trim();
		grade = grade == null ? null : grade.trim();
		guardianName = guardianName == null ? null : guardianName.trim();
		guardianPhone = guardianPhone == null ? null : guardianPhone.trim();
	}
}
