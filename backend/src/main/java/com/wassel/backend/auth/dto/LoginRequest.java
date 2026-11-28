package com.wassel.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
		@NotBlank(message = "Email is required")
		@Size(max = 255, message = "Email is too long")
		String email,

		// No account can have a password over 72 bytes (BCrypt's limit, see SetPasswordRequest), so a longer one
		// can never be right and is not worth hashing.
		@NotBlank(message = "Password is required")
		@MaxBytes(value = 72, message = "Password is too long")
		String password) {
}
