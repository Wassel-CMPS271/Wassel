package com.wassel.backend.routes.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

/** The full new order, every student id that should be a stop on the route. */
public record ReorderStopsRequest(
		@NotNull(message = "Student ids are required")
		List<UUID> studentIds) {
}
