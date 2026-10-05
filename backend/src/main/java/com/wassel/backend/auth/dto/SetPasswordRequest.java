package com.wassel.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SetPasswordRequest(
		@NotBlank(message = "Token is required")
		String token,

		@NotBlank(message = "Password is required")
		@Size(min = 10, message = "Password must be at least 10 characters")
		@MaxBytes(value = 72, message = "Password is too long")
		String password) {
}
