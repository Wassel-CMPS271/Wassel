package com.wassel.backend.drivers.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * The phone number must match the Lebanese format: {@code +961}, then a 1-2 digit prefix, then
 * two groups of 3 digits (e.g. {@code "+961 3 123 456"} or {@code "+961 70 234 567"}).
 */
public record CreateDriverRequest(
		@NotBlank(message = "First name is required")
		String firstName,

		@NotBlank(message = "Last name is required")
		String lastName,

		@NotBlank(message = "Phone number is required")
		@Pattern(regexp = "^\\+961 \\d{1,2} \\d{3} \\d{3}$",
				message = "Use a format like \"+961 3 123 456\" or \"+961 70 234 567\"")
		String phone,

		@NotBlank(message = "Email is required")
		@Pattern(regexp = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", message = "Enter a valid email address")
		String email) {

	// Trims before the @Pattern checks run, so surrounding whitespace doesn't fail validation.
	public CreateDriverRequest {
		firstName = firstName == null ? null : firstName.trim();
		lastName = lastName == null ? null : lastName.trim();
		phone = phone == null ? null : phone.trim();
		email = email == null ? null : email.trim();
	}
}
