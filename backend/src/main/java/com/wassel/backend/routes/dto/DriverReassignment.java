package com.wassel.backend.routes.dto;

/** What {@code RouteService.reassignDriver} did: the drivers before and after. Nothing changed when they are the same. */
public record DriverReassignment(RouteDriverSummary from, RouteDriverSummary to) {

	public boolean changed() {
		return !from.id().equals(to.id());
	}
}
