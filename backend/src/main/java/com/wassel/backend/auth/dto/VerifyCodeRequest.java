package com.wassel.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record VerifyCodeRequest(
		@NotBlank(message = "Code is required")
		@Pattern(regexp = "^\\d{6}$", message = "Enter the 6-digit code")
		String code) {

	// Trims before the @Pattern check runs, so a space from copy-pasting doesn't fail validation.
	public VerifyCodeRequest {
		code = code == null ? null : code.trim();
	}
}
