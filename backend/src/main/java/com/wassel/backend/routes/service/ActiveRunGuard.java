package com.wassel.backend.routes.service;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * What the routes module asks before it changes something a run in progress depends on (SCRUM-233 review).
 * Declared here and implemented by the runs module, so routes never imports runs. Each answer is the text of
 * the 409, or empty when the change may go ahead. Only today's runs count: a run left in progress on an
 * earlier date must not freeze its route.
 */
public interface ActiveRunGuard {

	/**
	 * The bus the student is on today (they have a confirmation on one of today's in-progress runs), or empty.
	 * Data, not the text of the 409: the text names the child and the route, which the runs module cannot read
	 * without needing the routes module back.
	 */
	Optional<StudentOnBus> studentOnBus(UUID schoolId, UUID studentId);

	/**
	 * Where the student is: {@code routeId} is the route of the run, which can differ from the route being edited,
	 * {@code action} is what the driver recorded in words ("picked up", "dropped off", "marked not present") and
	 * {@code at} when.
	 */
	record StudentOnBus(UUID routeId, String action, Instant at) {
	}

	/** Why the route's driver or vehicle cannot change now (one of its runs is in progress today), or empty. */
	Optional<String> blockReasonForRouteChange(UUID schoolId, UUID routeId, String routeName);
}
