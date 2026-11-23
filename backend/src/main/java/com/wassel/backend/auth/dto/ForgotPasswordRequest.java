package com.wassel.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ForgotPasswordRequest(
		@NotBlank(message = "Email is required")
		@Size(max = 255, message = "Email is too long")
		String email) {
}
