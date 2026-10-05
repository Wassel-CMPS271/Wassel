package com.wassel.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record ForgotPasswordRequest(
		@NotBlank(message = "Email is required")
		String email) {
}
