package com.wassel.backend.students.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record LinkParentRequest(
		@NotNull(message = "Parent user id is required")
		UUID parentUserId) {
}
