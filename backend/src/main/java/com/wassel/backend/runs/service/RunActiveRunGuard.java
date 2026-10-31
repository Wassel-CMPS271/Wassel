package com.wassel.backend.runs.service;

import com.wassel.backend.routes.service.ActiveRunGuard;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunState;
import com.wassel.backend.runs.repository.RunRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The runs module's answer to the routes module's {@link ActiveRunGuard}. A class of its own, not
 * {@link RunService}, because {@code RunService} reads {@code RouteService}, which would then need it back.
 * Only today's runs count, so a run left in progress on an earlier date never freezes its route.
 */
@Component
@RequiredArgsConstructor
class RunActiveRunGuard implements ActiveRunGuard {

	private final RunRepository runRepository;

	private final Clock clock;

	/**
	 * shortcut: no confirmations exist until SCRUM-235, so nobody is on a bus yet and this never blocks. 235
	 * answers "{student} is on the {route} bus (picked up {time}). Move them after the run ends." from the
	 * student's confirmation on one of today's in-progress runs.
	 */
	@Override
	public Optional<String> blockReasonForStudentMove(UUID schoolId, UUID studentId) {
		return Optional.empty();
	}

	@Override
	public Optional<String> blockReasonForRouteChange(UUID schoolId, UUID routeId, String routeName) {
		return runRepository.findBySchoolIdAndRunDateAndRouteIdIn(schoolId, LocalDate.now(clock), List.of(routeId))
				.stream().filter(run -> run.getState() == RunState.IN_PROGRESS).findFirst()
				.map(run -> "Route \"%s\" has its %s run in progress. Change the driver or vehicle after it ends."
						.formatted(routeName, run.getDirection() == RunDirection.MORNING ? "morning" : "afternoon"));
	}
}
