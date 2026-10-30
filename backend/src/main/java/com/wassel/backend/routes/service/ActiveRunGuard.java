package com.wassel.backend.routes.service;

import java.util.Optional;
import java.util.UUID;

/**
 * What the routes module asks before it changes something a run in progress depends on (SCRUM-233 review).
 * Declared here and implemented by the runs module, so routes never imports runs. Each answer is the text of
 * the 409, or empty when the change may go ahead. Only today's runs count: a run left in progress on an
 * earlier date must not freeze its route.
 */
public interface ActiveRunGuard {

	/** Why the student cannot leave their route now (they are on a bus today), or empty. */
	Optional<String> blockReasonForStudentMove(UUID schoolId, UUID studentId);

	/** Why the route's driver or vehicle cannot change now (one of its runs is in progress today), or empty. */
	Optional<String> blockReasonForRouteChange(UUID schoolId, UUID routeId, String routeName);
}
