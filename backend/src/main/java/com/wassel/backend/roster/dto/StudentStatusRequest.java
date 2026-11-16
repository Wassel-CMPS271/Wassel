package com.wassel.backend.roster.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** The body of {@code PUT /api/head-of-transport/students/{id}/status}: {@code active}, {@code paused} or {@code inactive} (archived). */
public record StudentStatusRequest(
		@NotBlank @Pattern(regexp = "(?i)active|paused|inactive", message = "must be active, paused or inactive") String status) {
}
