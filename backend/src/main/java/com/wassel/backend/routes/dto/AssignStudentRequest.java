package com.wassel.backend.routes.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AssignStudentRequest(
		@NotNull(message = "Student id is required")
		UUID studentId) {
}
