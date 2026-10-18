package com.wassel.backend.routes.exception;

import lombok.Getter;

import java.util.List;
import java.util.UUID;

/**
 * Thrown when a route can't be optimized as it stands (no stops, no school arrival time, stops
 * without a pin) or a proposal no longer matches the route. {@code studentIds} names the students
 * without a pin and is empty otherwise. Mapped to a 409 by the global exception handler.
 */
@Getter
public class RouteOptimizationConflictException extends RuntimeException {

	private final List<UUID> studentIds;

	public RouteOptimizationConflictException(String message) {
		this(message, List.of());
	}

	public RouteOptimizationConflictException(String message, List<UUID> studentIds) {
		super(message);
		this.studentIds = studentIds;
	}
}
