package com.wassel.backend.routes.dto;

/** Why a route is not an option for a student's best-route insertion (SCRUM-270, docs/contracts/roster.md). */
public enum RouteSkipReason {

	/** Every seat of the route's vehicle is taken. */
	FULL,

	/** Whatever the student's place, the first pickup would be before 06:00 (or the day before): the route cannot be driven. */
	STARTS_TOO_EARLY
}
