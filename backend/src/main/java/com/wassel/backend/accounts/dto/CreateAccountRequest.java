package com.wassel.backend.accounts.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateAccountRequest(
		@NotBlank(message = "Email is required")
		@Pattern(regexp = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", message = "Enter a valid email address")
		@Size(max = 255, message = "Email is too long")
		String email) {

	// Trims before the @Pattern check runs, so surrounding whitespace doesn't fail validation.
	public CreateAccountRequest {
		email = email == null ? null : email.trim();
	}
}
