package com.wassel.backend.routes.dto;

import com.wassel.backend.routing.service.RouteOptimizer;

import java.util.UUID;

/** An active student the proposal puts on no route, and why. */
public record UnplacedStudentResponse(
		UUID studentId,
		String firstName,
		String lastName,
		String address,
		RouteOptimizer.Reason reason) {
}
