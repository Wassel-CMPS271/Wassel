package com.wassel.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SetPasswordRequest(
		// A real token is 43 characters.
		@NotBlank(message = "Token is required")
		@Size(max = 200, message = "Token is too long")
		String token,

		@NotBlank(message = "Password is required")
		@Size(min = 10, message = "Password must be at least 10 characters")
		@MaxBytes(value = 72, message = "Password is too long")
		String password) {
}
