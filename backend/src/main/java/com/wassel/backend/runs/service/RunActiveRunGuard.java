package com.wassel.backend.runs.service;

import com.wassel.backend.routes.service.ActiveRunGuard;
import com.wassel.backend.runs.entity.ConfirmationStatus;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunState;
import com.wassel.backend.runs.repository.ConfirmationOnRun;
import com.wassel.backend.runs.repository.ConfirmationRepository;
import com.wassel.backend.runs.repository.RunRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
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

	private final ConfirmationRepository confirmationRepository;

	private final Clock clock;

	/**
	 * Any confirmation on one of today's in-progress runs puts the student on a bus, whatever it is: a child
	 * marked not present may still turn up, and one dropped off is still the driver's until the run ends. If they
	 * are on several runs, the one with the highest status is reported.
	 */
	@Override
	public Optional<StudentOnBus> studentOnBus(UUID schoolId, UUID studentId) {
		return confirmationRepository.findOnRunsInProgress(schoolId, studentId, LocalDate.now(clock)).stream()
				.max(Comparator.comparing(ConfirmationOnRun::status))
				.map(row -> new StudentOnBus(row.routeId(), wordsFor(row.status()), row.confirmedAt()));
	}

	private static String wordsFor(ConfirmationStatus status) {
		return switch (status) {
			case PICKED_UP -> "picked up";
			case DROPPED_OFF -> "dropped off";
			case NOT_PRESENT -> "marked not present";
		};
	}

	@Override
	public Optional<String> blockReasonForRouteChange(UUID schoolId, UUID routeId, String routeName) {
		return runRepository.findBySchoolIdAndRunDateAndRouteIdIn(schoolId, LocalDate.now(clock), List.of(routeId))
				.stream().filter(run -> run.getState() == RunState.IN_PROGRESS).findFirst()
				.map(run -> "Route \"%s\" has its %s run in progress. Change the driver or vehicle after it ends."
						.formatted(routeName, run.getDirection() == RunDirection.MORNING ? "morning" : "afternoon"));
	}
}
