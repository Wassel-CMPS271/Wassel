package com.wassel.backend.routes.dto;

import com.wassel.backend.routing.service.RouteOptimizer;

import java.util.List;
import java.util.UUID;

/**
 * What the optimizer suggests for a route (routing contract). {@code id} and {@code proposed}
 * are null when the route can't be planned, and then {@code reasons} says why.
 */
public record ProposalResponse(
		UUID id,
		boolean feasible,
		ProposalOrderResponse current,
		ProposalOrderResponse proposed,
		List<RouteOptimizer.Reason> reasons) {
}
