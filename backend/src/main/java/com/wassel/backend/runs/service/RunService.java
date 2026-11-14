package com.wassel.backend.runs.service;

import com.wassel.backend.absences.service.AbsenceService;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.dto.DriverRouteResponse;
import com.wassel.backend.routes.dto.DriverRouteStop;
import com.wassel.backend.routes.dto.RouteDriverSummary;
import com.wassel.backend.routes.dto.RouteSummaryResponse;
import com.wassel.backend.routes.dto.RouteVehicleSummary;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.runs.dto.ChildOnRoute;
import com.wassel.backend.runs.dto.BusLocationResponse;
import com.wassel.backend.runs.dto.BusPositionResponse;
import com.wassel.backend.runs.dto.ChildRunResponse;
import com.wassel.backend.runs.dto.LocationRequest;
import com.wassel.backend.runs.dto.LocationStatus;
import com.wassel.backend.runs.dto.RunLocationResponse;
import com.wassel.backend.runs.dto.ConfirmationResponse;
import com.wassel.backend.runs.dto.DailyRunTotals;
import com.wassel.backend.runs.dto.DayType;
import com.wassel.backend.runs.dto.RunCountsResponse;
import com.wassel.backend.runs.dto.RunResponse;
import com.wassel.backend.runs.dto.RunRouteResponse;
import com.wassel.backend.runs.dto.RunStopResponse;
import com.wassel.backend.runs.dto.RunsDayResponse;
import com.wassel.backend.runs.entity.Confirmation;
import com.wassel.backend.runs.entity.ConfirmationStatus;
import com.wassel.backend.runs.entity.Run;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunLocation;
import com.wassel.backend.runs.entity.RunState;
import com.wassel.backend.runs.event.ConfirmationRecordedEvent;
import com.wassel.backend.runs.exception.ConfirmationConflictException;
import com.wassel.backend.runs.exception.RunNotFoundException;
import com.wassel.backend.runs.exception.RunStateConflictException;
import com.wassel.backend.runs.repository.ConfirmationRepository;
import com.wassel.backend.runs.repository.RunLocationRepository;
import com.wassel.backend.runs.repository.RunRepository;
import com.wassel.backend.schools.dto.SchoolTimesResponse;
import com.wassel.backend.schools.service.HalfDayService;
import com.wassel.backend.schools.service.HolidayService;
import com.wassel.backend.schools.service.SchoolSettingsService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.users.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.BinaryOperator;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

/**
 * The daily runs (SCRUM-233, docs/contracts/runs.md). Runs are created only when today's are asked for, by the
 * driver (their own route) or the head of transportation (every route), and never for another date. A run
 * stores no stops, vehicle or driver: they are read from the route on every response, as is the kind of day, so
 * a holiday added after the runs exist hides them. The day is the date in the school's zone, taken once per
 * request from the {@link Clock}.
 */
@Service
@RequiredArgsConstructor
public class RunService {

	private final RunRepository runRepository;

	private final ConfirmationRepository confirmationRepository;

	private final RunLocationRepository runLocationRepository;

	private final StudentService studentService;

	private final RouteService routeService;

	private final AbsenceService absenceService;

	private final DriverService driverService;

	private final HolidayService holidayService;

	private final HalfDayService halfDayService;

	private final SchoolSettingsService schoolSettingsService;

	private final Clock clock;

	private final TransactionTemplate transactionTemplate;

	private final ApplicationEventPublisher events;

	/**
	 * Today's two runs of the signed-in driver's route, with stops. Empty when they have no route, or on a holiday.
	 * Not {@code @Transactional}: the route lookup may wait on the road provider, and a transaction around it
	 * would hold a database connection meanwhile. Only creating and reading the runs is in one.
	 */
	public RunsDayResponse driverDay(User driver) {
		UUID schoolId = driver.getSchoolId();
		LocalDate today = LocalDate.now(clock);
		DayType dayType = dayTypeOf(schoolId, today);
		Optional<DriverRouteResponse> found = routeOf(driver, dayType);
		if (found.isEmpty()) {
			return new RunsDayResponse(today, dayType, List.of());
		}
		DriverRouteResponse route = found.get();
		SchoolTimesResponse times = schoolSettingsService.getTimes(schoolId);
		List<RunStopResponse> morning = morningStops(schoolId, route, today);
		Map<RunDirection, Run> runs = transactionTemplate.execute(status -> {
			runRepository.createMissing(schoolId, route.id(), today);
			return runsOf(schoolId, today, List.of(route.id())).get(route.id());
		});
		Map<UUID, List<Confirmation>> confirmed = confirmationsOf(schoolId, runs.values());
		Set<UUID> sharing = sharingOf(schoolId, runs.values());
		List<RunResponse> result = Arrays.stream(RunDirection.values())
				.map(direction -> driverRun(runs.get(direction), route, morning, dayType, times, confirmed, sharing))
				.toList();
		return new RunsDayResponse(today, dayType, result);
	}

	/**
	 * Starts the driver's run: {@code NOT_STARTED} to {@code IN_PROGRESS}, a repeat changes nothing (SCRUM-234).
	 * Not {@code @Transactional}, for the reason {@link #driverDay} gives; {@link #move} opens its own.
	 */
	public RunResponse start(User driver, UUID runId) {
		return move(driver, runId, RunState.IN_PROGRESS);
	}

	/** Ends the driver's run: {@code IN_PROGRESS} to {@code FINISHED}, a repeat changes nothing (SCRUM-234). */
	public RunResponse end(User driver, UUID runId) {
		return move(driver, runId, RunState.FINISHED);
	}

	/**
	 * A driver may act on a run only if it is in their list right now: one of today's runs on their own route,
	 * on a day that is not a holiday. Anything else (another driver's, another school's, unknown, yesterday's,
	 * hidden by a holiday) is the same 404. The move is one conditional update, so simultaneous requests keep
	 * the first time; the run is then re-read, which tells a repeat (already in the target state, 200) from a
	 * conflict (409), and gives the answer the times as stored.
	 */
	private RunResponse move(User driver, UUID runId, RunState target) {
		UUID schoolId = driver.getSchoolId();
		LocalDate today = LocalDate.now(clock);
		DayType dayType = dayTypeOf(schoolId, today);
		DriverRouteResponse route = routeOf(driver, dayType).orElseThrow(RunService::runNotFound);
		Instant now = Instant.now(clock);
		// The route lookup above may wait on the road provider, so only the checks and the update are in a transaction.
		Run run = transactionTemplate.execute(status -> {
			todaysRun(schoolId, today, route.id(), runId).orElseThrow(RunService::runNotFound);
			if (target == RunState.IN_PROGRESS) {
				runRepository.markStarted(schoolId, runId, now);
			} else {
				runRepository.markEnded(schoolId, runId, now);
				// Ending also withdraws consent and drops the position, in the same transaction as the end.
				runLocationRepository.stopSharing(schoolId, runId);
			}
			Run current = todaysRun(schoolId, today, route.id(), runId).orElseThrow(RunService::runNotFound);
			if (current.getState() != target) {
				throw new RunStateConflictException("Run is " + current.getState() + ", so it cannot be "
						+ (target == RunState.IN_PROGRESS ? "started" : "ended"));
			}
			return current;
		});
		return driverAnswer(run, route, dayType);
	}

	/**
	 * Records what the driver did with a student on a run (SCRUM-235, docs/contracts/runs.md "Confirmations") and
	 * answers with the whole run. The 404 rule is the one {@link #move} has, then the student (a stop of this run,
	 * or someone already confirmed on it who has left the route), then the run's state, then the table. The run row
	 * is locked first, so another confirmation of the student, or the run ending, waits instead of interleaving.
	 * The status a student already has is kept even when a later one exists: a retry that arrives after the next
	 * tap is not a mistake. Not {@code @Transactional}, for the reason {@link #driverDay} gives.
	 */
	public RunResponse confirm(User driver, UUID runId, UUID studentId, ConfirmationStatus status) {
		UUID schoolId = driver.getSchoolId();
		LocalDate today = LocalDate.now(clock);
		DayType dayType = dayTypeOf(schoolId, today);
		DriverRouteResponse route = routeOf(driver, dayType).orElseThrow(RunService::runNotFound);
		Run run = transactionTemplate.execute(tx -> {
			Run locked = runRepository.findLockedBySchoolIdAndId(schoolId, runId)
					.filter(found -> found.getRouteId().equals(route.id()) && found.getRunDate().equals(today))
					.orElseThrow(RunService::runNotFound);
			List<ConfirmationStatus> had = confirmationRepository
					.findBySchoolIdAndRunIdAndStudentId(schoolId, runId, studentId).stream()
					.map(Confirmation::getStatus).toList();
			if (had.isEmpty() && route.stops().stream().noneMatch(stop -> stop.studentId().equals(studentId))) {
				throw new RunNotFoundException("Student is not on this run");
			}
			if (locked.getState() != RunState.IN_PROGRESS) {
				throw new RunStateConflictException("Run is " + locked.getState() + ", so it cannot be confirmed");
			}
			if (had.contains(status)) {
				return locked;
			}
			ConfirmationStatus current = had.stream().max(Comparator.naturalOrder()).orElse(null);
			boolean allowed = switch (status) {
				case NOT_PRESENT -> current == null;
				case PICKED_UP -> current == null || current == ConfirmationStatus.NOT_PRESENT;
				case DROPPED_OFF -> current == ConfirmationStatus.PICKED_UP;
			};
			if (!allowed) {
				throw new ConfirmationConflictException("Student " + (current == null ? "has no confirmation yet"
						: "is " + current) + ", so they cannot be marked " + status);
			}
			// The time is read after the lock, so rows are saved in the order the rule saw them.
			Instant now = Instant.now(clock);
			// Only a status saved for the first time is an event; listeners run in this transaction (SCRUM-267).
			if (confirmationRepository.insertIfMissing(schoolId, runId, studentId, status.name(), now) == 1) {
				events.publishEvent(new ConfirmationRecordedEvent(schoolId, runId, studentId,
						locked.getDirection().name(), status.name(), now));
			}
			return locked;
		});
		return driverAnswer(run, route, dayType);
	}

	/**
	 * The driver's opt-in or withdrawal for a run (SCRUM-261, "Live location"). The 404 rule is {@link #confirm}'s, and
	 * so is the lock on the run row: an opt-in and the run ending wait for each other, so sharing can never be left on
	 * for a finished run. Opting in needs the run in progress; withdrawing works in any state. Answers with the run.
	 */
	public RunResponse setSharing(User driver, UUID runId, boolean enabled) {
		UUID schoolId = driver.getSchoolId();
		LocalDate today = LocalDate.now(clock);
		DayType dayType = dayTypeOf(schoolId, today);
		DriverRouteResponse route = routeOf(driver, dayType).orElseThrow(RunService::runNotFound);
		Run run = transactionTemplate.execute(tx -> {
			Run locked = runRepository.findLockedBySchoolIdAndId(schoolId, runId)
					.filter(found -> found.getRouteId().equals(route.id()) && found.getRunDate().equals(today))
					.orElseThrow(RunService::runNotFound);
			if (!enabled) {
				runLocationRepository.stopSharing(schoolId, runId);
			} else if (locked.getState() != RunState.IN_PROGRESS) {
				throw new RunStateConflictException("Run is " + locked.getState() + ", so it cannot share its location");
			} else {
				runLocationRepository.startSharing(schoolId, runId, route.driver().id());
			}
			return locked;
		});
		return driverAnswer(run, route, dayType);
	}

	/**
	 * Stores the driver's latest position for their run. The 404 rule is {@link #move}'s, but the route is found by id
	 * only: this is called every few seconds, and the stops and road times of {@code findRouteOfDriver} are not needed.
	 * Then the run must be in progress (409), and the single conditional update must find this driver sharing it (409).
	 */
	public void recordLocation(User driver, UUID runId, LocationRequest request) {
		UUID schoolId = driver.getSchoolId();
		LocalDate today = LocalDate.now(clock);
		if (dayTypeOf(schoolId, today) == DayType.HOLIDAY) {
			throw runNotFound();
		}
		UUID driverId = driverService.findDriverIdForUser(schoolId, driver.getId()).orElseThrow(RunService::runNotFound);
		UUID routeId = routeService.findRouteIdOfDriver(schoolId, driverId).orElseThrow(RunService::runNotFound);
		Run run = todaysRun(schoolId, today, routeId, runId).orElseThrow(RunService::runNotFound);
		if (run.getState() != RunState.IN_PROGRESS) {
			throw new RunStateConflictException("Run is " + run.getState() + ", so it cannot take a position");
		}
		Instant now = Instant.now(clock);
		int saved = transactionTemplate.execute(tx -> runLocationRepository.savePosition(schoolId, runId, driverId,
				request.latitude(), request.longitude(), request.accuracyMeters(), now));
		if (saved == 0) {
			throw new RunStateConflictException("Location sharing is off for this run");
		}
	}

	/**
	 * Where the bus is for one child, for the {@code parent} module. The position is shown only while the child's
	 * {@code stopsLeft} (SCRUM-237) is not null, so a child already picked up, dropped off, skipped or absent loses it
	 * for the rest of the run. Everything else is {@code UNAVAILABLE}, without a reason. The caller has checked the child.
	 */
	public BusLocationResponse childBusLocation(UUID schoolId, UUID studentId, UUID routeId) {
		ChildRunResponse today = todayRunStatus(schoolId, List.of(new ChildOnRoute(studentId, routeId))).get(studentId);
		if (today == null || today.stopsLeft() == null) {
			return BusLocationResponse.UNAVAILABLE;
		}
		// Absent only if midnight passed since todayRunStatus read the date: nothing to show for the new day.
		Run run = runsOf(schoolId, LocalDate.now(clock), List.of(routeId)).getOrDefault(routeId, Map.of())
				.get(today.direction());
		return run == null ? BusLocationResponse.UNAVAILABLE : locate(
				runLocationRepository.findBySchoolIdAndRunId(schoolId, run.getId()).orElse(null), Instant.now(clock));
	}

	/** Every run of the school in progress today with where its bus is. Empty on a holiday. */
	public List<RunLocationResponse> locationsToday(UUID schoolId) {
		LocalDate today = LocalDate.now(clock);
		if (dayTypeOf(schoolId, today) == DayType.HOLIDAY) {
			return List.of();
		}
		List<Run> inProgress = runRepository.findBySchoolIdAndRunDateAndState(schoolId, today, RunState.IN_PROGRESS);
		Map<UUID, RunLocation> byRun = runLocationRepository
				.findBySchoolIdAndRunIdIn(schoolId, inProgress.stream().map(Run::getId).toList()).stream()
				.collect(Collectors.toMap(RunLocation::getRunId, Function.identity()));
		Instant now = Instant.now(clock);
		return inProgress.stream().map(run -> {
			BusLocationResponse bus = locate(byRun.get(run.getId()), now);
			return new RunLocationResponse(run.getId(), bus.status(), bus.position());
		}).toList();
	}

	/** LIVE, STALE or UNAVAILABLE from the age of the stored position (null for no row), measured by the server. */
	private static BusLocationResponse locate(RunLocation location, Instant now) {
		if (location == null || !location.isSharing() || location.getReceivedAt() == null) {
			return BusLocationResponse.UNAVAILABLE;
		}
		Duration age = Duration.between(location.getReceivedAt(), now);
		if (age.compareTo(RunLocation.SHOWN_FOR) > 0) {
			return BusLocationResponse.UNAVAILABLE;
		}
		LocationStatus status = age.compareTo(RunLocation.LIVE_FOR) > 0 ? LocationStatus.STALE : LocationStatus.LIVE;
		return new BusLocationResponse(status, new BusPositionResponse(location.getLatitude(),
				location.getLongitude(), location.getAccuracyMeters(), location.getReceivedAt(),
				Math.max(0, age.toSeconds())));
	}

	/** The ids of these runs whose driver is sharing now. */
	private Set<UUID> sharingOf(UUID schoolId, Collection<Run> runs) {
		if (runs.isEmpty()) {
			return Set.of();
		}
		return runLocationRepository.findBySchoolIdAndRunIdIn(schoolId, runs.stream().map(Run::getId).toList()).stream()
				.filter(RunLocation::isSharing).map(RunLocation::getRunId).collect(Collectors.toSet());
	}

	/**
	 * For the {@code reports} module (SCRUM-271): the run figures of each date in the range that has a run or a
	 * confirmation, from two grouped queries and nothing else (no road time, no roster). A date with neither is not
	 * in the list; the caller fills it with zeros.
	 */
	@Transactional(readOnly = true)
	public List<DailyRunTotals> dailyTotals(UUID schoolId, LocalDate from, LocalDate to) {
		Map<LocalDate, long[]> byDate = new TreeMap<>();
		for (Object[] row : runRepository.countByDate(schoolId, from, to)) {
			long[] figures = byDate.computeIfAbsent((LocalDate) row[0], date -> new long[5]);
			figures[0] = ((Number) row[1]).longValue();
			figures[1] = ((Number) row[2]).longValue();
		}
		for (Object[] row : confirmationRepository.riderCountsByDate(schoolId, from, to)) {
			long[] figures = byDate.computeIfAbsent(LocalDate.parse(row[0].toString()), date -> new long[5]);
			figures[2] = ((Number) row[1]).longValue();
			figures[3] = ((Number) row[2]).longValue();
			figures[4] = ((Number) row[3]).longValue();
		}
		return byDate.entrySet().stream().map(entry -> new DailyRunTotals(entry.getKey(), entry.getValue()[0],
				entry.getValue()[1], entry.getValue()[2], entry.getValue()[3], entry.getValue()[4])).toList();
	}

	/** One run as the driver sees it, with the confirmations as stored now. */
	private RunResponse driverAnswer(Run run, DriverRouteResponse route, DayType dayType) {
		UUID schoolId = run.getSchoolId();
		return driverRun(run, route, morningStops(schoolId, route, run.getRunDate()), dayType, schoolSettingsService.getTimes(schoolId),
				confirmationsOf(schoolId, List.of(run)), sharingOf(schoolId, List.of(run)));
	}

	private Map<UUID, List<Confirmation>> confirmationsOf(UUID schoolId, Collection<Run> runs) {
		return confirmationsByRunId(schoolId, runs.stream().map(Run::getId).toList());
	}

	private Map<UUID, List<Confirmation>> confirmationsByRunId(UUID schoolId, List<UUID> runIds) {
		if (runIds.isEmpty()) {
			return Map.of();
		}
		return confirmationRepository.findBySchoolIdAndRunIdIn(schoolId, runIds)
				.stream().collect(Collectors.groupingBy(Confirmation::getRunId));
	}

	/** Each student's latest confirmation on a run: the highest status they have, not the newest row. */
	private static Map<UUID, Confirmation> latestOf(Collection<Confirmation> confirmed) {
		return confirmed.stream().collect(Collectors.toMap(Confirmation::getStudentId, Function.identity(),
				BinaryOperator.maxBy(Comparator.comparing(Confirmation::getStatus))));
	}

	/**
	 * {@code absent} is the caller's own count of stops with {@code absent: true} and no confirmation (contract: a
	 * confirmation wins) — {@link #driverRun} filters its real stops for it; {@link #runsDay} has no stops for its
	 * {@code RunSummary} (SCRUM-260) and passes the same count computed from the route's roster instead.
	 */
	private static RunCountsResponse countsOf(int students, int absent, Collection<Confirmation> latest) {
		int droppedOff = countOf(latest, ConfirmationStatus.DROPPED_OFF);
		return new RunCountsResponse(students, absent, countOf(latest, ConfirmationStatus.PICKED_UP) + droppedOff, droppedOff,
				countOf(latest, ConfirmationStatus.NOT_PRESENT));
	}

	private static int countOf(Collection<Confirmation> latest, ConfirmationStatus status) {
		return (int) latest.stream().filter(confirmation -> confirmation.getStatus() == status).count();
	}

	private static ConfirmationResponse responseOf(Confirmation confirmation) {
		return confirmation == null ? null
				: new ConfirmationResponse(confirmation.getStatus(), confirmation.getConfirmedAt());
	}

	/** The run, if it is one of the route's runs on that day in that school. */
	private Optional<Run> todaysRun(UUID schoolId, LocalDate today, UUID routeId, UUID runId) {
		return runRepository.findBySchoolIdAndRunDateAndRouteIdIn(schoolId, today, List.of(routeId)).stream()
				.filter(run -> run.getId().equals(runId))
				.findAny();
	}

	private static RunNotFoundException runNotFound() {
		return new RunNotFoundException("Run not found");
	}

	/** The route the driver is on, if any; none on a holiday, when they have no runs to see. */
	private Optional<DriverRouteResponse> routeOf(User driver, DayType dayType) {
		if (dayType == DayType.HOLIDAY) {
			return Optional.empty();
		}
		UUID schoolId = driver.getSchoolId();
		return driverService.findDriverIdForUser(schoolId, driver.getId())
				.flatMap(driverId -> routeService.findRouteOfDriver(schoolId, driverId));
	}

	/**
	 * One run with its stops, as the driver sees it. Today's runs, start, end and confirm use it: one place to
	 * fill in absences (SCRUM-239) and confirmations. Each stop shows its latest confirmation on this run. A
	 * student confirmed on the run who has left the route is added last, so a child on the bus never disappears.
	 */
	private RunResponse driverRun(Run run, DriverRouteResponse route, List<RunStopResponse> morning, DayType dayType,
			SchoolTimesResponse times, Map<UUID, List<Confirmation>> confirmed, Set<UUID> sharing) {
		Map<UUID, Confirmation> latest = latestOf(confirmed.getOrDefault(run.getId(), List.of()));
		List<RunStopResponse> stops = (run.getDirection() == RunDirection.MORNING ? morning : afternoonStops(morning))
				.stream().map(stop -> stop.withConfirmation(responseOf(latest.get(stop.studentId()))))
				.collect(Collectors.toCollection(ArrayList::new));
		appendRemoved(stops, run.getSchoolId(), latest);
		return toResponse(run, new RunRouteResponse(route.id(), route.name()), route.vehicle(), route.driver(),
				schoolTimeOf(run.getDirection(), dayType, times), stops, sharing.contains(run.getId()), countsOf(stops.size(),
						(int) stops.stream().filter(stop -> stop.absent() && stop.confirmation() == null).count(),
						latest.values()));
	}

	/** After the route's stops, numbered on, in the order they were confirmed. Their details come from the roster. */
	private void appendRemoved(List<RunStopResponse> stops, UUID schoolId, Map<UUID, Confirmation> latest) {
		Set<UUID> shown = stops.stream().map(RunStopResponse::studentId).collect(Collectors.toSet());
		latest.values().stream().filter(confirmation -> !shown.contains(confirmation.getStudentId()))
				.sorted(Comparator.comparing(Confirmation::getConfirmedAt).thenComparing(Confirmation::getStudentId))
				.forEach(confirmation -> {
					StudentResponse student = studentService.getStudent(schoolId, confirmation.getStudentId());
					stops.add(new RunStopResponse(student.id(), stops.size() + 1, student.firstName(),
							student.lastName(), student.address(), student.latitude(), student.longitude(), null,
							student.guardianName(), student.guardianPhone(), false, responseOf(confirmation), true));
				});
	}

	/**
	 * Every run of the school on the date, without stops, routes in the order of {@code GET /routes} and each
	 * route's morning run before its afternoon run. Today's runs are created first; any other date only reads.
	 * {@code date} is null for today. {@code counts.absent} (SCRUM-260) needs the roster of every route that has a
	 * run on the date, one read each, and one batched absence query over all of them — the same shape
	 * {@link #todayRunStatus} uses for its own roster and absence reads.
	 */
	@Transactional
	public RunsDayResponse runsDay(UUID schoolId, LocalDate date) {
		LocalDate today = LocalDate.now(clock);
		LocalDate day = date == null ? today : date;
		DayType dayType = dayTypeOf(schoolId, day);
		List<RouteSummaryResponse> routes = dayType == DayType.HOLIDAY ? List.of() : routeService.listRoutes(schoolId);
		if (routes.isEmpty()) {
			return new RunsDayResponse(day, dayType, List.of());
		}
		List<UUID> routeIds = routes.stream().map(RouteSummaryResponse::id).toList();
		if (day.equals(today)) {
			// shortcut: one insert per route, fine for a school's few dozen routes; batch them if that grows
			routeIds.forEach(routeId -> runRepository.createMissing(schoolId, routeId, day));
		}
		Map<UUID, Map<RunDirection, Run>> runs = runsOf(schoolId, day, routeIds);
		Map<UUID, List<Confirmation>> confirmed = confirmationsOf(schoolId,
				runs.values().stream().flatMap(ofRoute -> ofRoute.values().stream()).toList());
		// A confirmed student who has left the route stays on its run (contract), so they count as one of its students.
		Map<UUID, UUID> routeOfStudent = studentService.findRouteIds(schoolId, confirmed.values().stream()
				.flatMap(List::stream).map(Confirmation::getStudentId).collect(Collectors.toSet()));
		// Only routes with a run today need their roster. One batched absence query over all of them, not one per
		// route: a removed-but-confirmed student never needs checking here, since they always have a confirmation
		// (that's why appendRemoved keeps them), so they can never count as "absent and no confirmation" anyway.
		Map<UUID, List<UUID>> rosters = runs.keySet().stream().collect(Collectors.toMap(Function.identity(),
				routeId -> studentService.listOnRoute(schoolId, routeId).stream().map(StudentResponse::id).toList()));
		Set<UUID> absentToday = absenceService.absentStudentIds(schoolId,
				rosters.values().stream().flatMap(List::stream).collect(Collectors.toSet()), day);
		SchoolTimesResponse times = schoolSettingsService.getTimes(schoolId);
		Set<UUID> sharing = sharingOf(schoolId, runs.values().stream().flatMap(ofRoute -> ofRoute.values().stream()).toList());
		List<RunResponse> result = new ArrayList<>();
		for (RouteSummaryResponse route : routes) {
			Map<RunDirection, Run> ofRoute = runs.getOrDefault(route.id(), Map.of());
			List<UUID> roster = rosters.getOrDefault(route.id(), List.of());
			for (RunDirection direction : RunDirection.values()) {
				Run run = ofRoute.get(direction);
				if (run != null) {
					Map<UUID, Confirmation> latest = latestOf(confirmed.getOrDefault(run.getId(), List.of()));
					long left = latest.keySet().stream().filter(id -> !route.id().equals(routeOfStudent.get(id))).count();
					int absent = (int) roster.stream()
							.filter(id -> absentToday.contains(id) && !latest.containsKey(id)).count();
					result.add(toResponse(run, new RunRouteResponse(route.id(), route.name()), route.vehicle(),
							route.driver(), schoolTimeOf(direction, dayType, times), null, sharing.contains(run.getId()),
							countsOf(route.studentCount() + (int) left, absent, latest.values())));
				}
			}
		}
		return new RunsDayResponse(day, dayType, result);
	}

	/**
	 * Today's run for each child, for the {@code parent} module (SCRUM-237). Every child given gets an answer, except
	 * on a holiday, when the answer is empty. Read-only: a direction whose run does not exist yet counts as
	 * {@code NOT_STARTED} instead of being created. It reads the school's runs and confirmations in one query each,
	 * however many children there are, plus one roster read per route that has a run in progress and one absence
	 * query for those rosters; it needs no road times. Not {@code @Transactional}, like the rest of this service.
	 */
	public Map<UUID, ChildRunResponse> todayRunStatus(UUID schoolId, Collection<ChildOnRoute> children) {
		LocalDate today = LocalDate.now(clock);
		if (children.isEmpty() || dayTypeOf(schoolId, today) == DayType.HOLIDAY) {
			return Map.of();
		}
		List<UUID> routeIds = children.stream().map(ChildOnRoute::routeId).distinct().toList();
		Map<UUID, Map<RunDirection, Run>> runs = runsOf(schoolId, today, routeIds);
		Map<UUID, ShownRun> shown = routeIds.stream().collect(Collectors.toMap(Function.identity(),
				routeId -> shownRun(routeId, runs.getOrDefault(routeId, Map.of()))));
		// Only a run in progress needs its roster, confirmations and absences.
		List<ShownRun> inProgress = shown.values().stream().filter(run -> run.state() == RunState.IN_PROGRESS).toList();
		Map<UUID, List<Confirmation>> confirmed = confirmationsByRunId(schoolId,
				inProgress.stream().map(ShownRun::id).toList());
		Map<UUID, List<UUID>> rosters = inProgress.stream().collect(Collectors.toMap(ShownRun::routeId,
				run -> studentService.listOnRoute(schoolId, run.routeId()).stream().map(StudentResponse::id).toList()));
		Set<UUID> absent = absenceService.absentStudentIds(schoolId,
				rosters.values().stream().flatMap(List::stream).collect(Collectors.toSet()), today);
		return children.stream().collect(Collectors.toMap(ChildOnRoute::studentId, child -> {
			ShownRun run = shown.get(child.routeId());
			Integer left = run.state() != RunState.IN_PROGRESS ? null : stopsLeft(run.direction(), child.studentId(),
					rosters.get(child.routeId()), latestOf(confirmed.getOrDefault(run.id(), List.of())), absent);
			return new ChildRunResponse(run.direction(), run.state(), left);
		}));
	}

	/** One of a route's two runs as the parent module sees it; {@code id} is null for a run that does not exist yet. */
	private record ShownRun(UUID id, UUID routeId, RunDirection direction, RunState state) {
	}

	/**
	 * The route's run a parent should see: one in progress (the morning one if both are), else the first not
	 * started, else the afternoon one, finished. A direction with no row yet is a {@code NOT_STARTED} run that
	 * is not saved, so the morning being over and the afternoon not opened yet reads as "not started".
	 */
	private ShownRun shownRun(UUID routeId, Map<RunDirection, Run> ofRoute) {
		List<ShownRun> both = Arrays.stream(RunDirection.values()).map(direction -> {
			Run run = ofRoute.get(direction);
			return run == null ? new ShownRun(null, routeId, direction, RunState.NOT_STARTED)
					: new ShownRun(run.getId(), routeId, direction, run.getState());
		}).toList();
		return Stream.of(RunState.IN_PROGRESS, RunState.NOT_STARTED)
				.flatMap(state -> both.stream().filter(run -> run.state() == state))
				.findFirst().orElse(both.getLast());
	}

	/**
	 * Stops before the child's (in the run's order) that are still to do, by the contract's own definitions in
	 * "What the driver screen works out for itself". Null for a child who is done or skipped, or who is not on the
	 * roster any more (they left the route between the two reads).
	 */
	private static Integer stopsLeft(RunDirection direction, UUID studentId, List<UUID> morning,
			Map<UUID, Confirmation> latest, Set<UUID> absent) {
		List<UUID> order = direction == RunDirection.MORNING ? morning : morning.reversed();
		int own = order.indexOf(studentId);
		if (own < 0 || !pending(direction, studentId, latest, absent)) {
			return null;
		}
		return (int) order.subList(0, own).stream().filter(id -> pending(direction, id, latest, absent)).count();
	}

	/** Neither done nor skippable: the bus still has to stop here. */
	private static boolean pending(RunDirection direction, UUID studentId, Map<UUID, Confirmation> latest,
			Set<UUID> absent) {
		boolean skippable = absent.contains(studentId) && !latest.containsKey(studentId);
		return !skippable && !isDone(direction, latest.get(studentId));
	}

	/** Morning: any confirmation. Afternoon: dropped off or not present (everyone is picked up at the gate). */
	private static boolean isDone(RunDirection direction, Confirmation latest) {
		return latest != null && (direction == RunDirection.MORNING
				|| latest.getStatus() != ConfirmationStatus.PICKED_UP);
	}

	/** Monday to Friday, no holiday in the calendar: a school day, or a half-day if it is marked as one. */
	private DayType dayTypeOf(UUID schoolId, LocalDate date) {
		DayOfWeek weekday = date.getDayOfWeek();
		if (weekday == DayOfWeek.SATURDAY || weekday == DayOfWeek.SUNDAY || holidayService.isHoliday(schoolId, date)) {
			return DayType.HOLIDAY;
		}
		return halfDayService.isHalfDay(schoolId, date) ? DayType.HALF_DAY : DayType.SCHOOL_DAY;
	}

	/** The school's arrival time for a morning run, its dismissal time for an afternoon one (null on a half-day). */
	private LocalTime schoolTimeOf(RunDirection direction, DayType dayType, SchoolTimesResponse times) {
		if (direction == RunDirection.MORNING) {
			return times.arrivalTime();
		}
		// A half-day has no dismissal time of its own (contract, "No half-day times"): null beats a wrong time.
		return dayType == DayType.HALF_DAY ? null : times.dismissalTime();
	}

	private Map<UUID, Map<RunDirection, Run>> runsOf(UUID schoolId, LocalDate day, List<UUID> routeIds) {
		return runRepository.findBySchoolIdAndRunDateAndRouteIdIn(schoolId, day, routeIds).stream()
				.collect(Collectors.groupingBy(Run::getRouteId,
						Collectors.toMap(Run::getDirection, Function.identity())));
	}

	/**
	 * The route's stops as run stops, in the route's order with the times and guardians the routes module read
	 * together with it. {@code absent} (SCRUM-239) is this route's students with a live absence for {@code today},
	 * from {@link AbsenceService#absentStudentIds}, read fresh on every fetch — never its repository. Confirmations
	 * belong to a run, so {@link #driverRun} adds them.
	 */
	private List<RunStopResponse> morningStops(UUID schoolId, DriverRouteResponse route, LocalDate today) {
		List<UUID> studentIds = route.stops().stream().map(DriverRouteStop::studentId).toList();
		Set<UUID> absent = absenceService.absentStudentIds(schoolId, studentIds, today);
		return route.stops().stream().map(stop -> toStop(stop, absent.contains(stop.studentId()))).toList();
	}

	private RunStopResponse toStop(DriverRouteStop stop, boolean absent) {
		return new RunStopResponse(stop.studentId(), stop.position(), stop.firstName(), stop.lastName(),
				stop.address(), stop.latitude(), stop.longitude(), stop.arrivalTime(), stop.guardianName(),
				stop.guardianPhone(), absent, null, false);
	}

	/** The morning order reversed, numbered 1..n again, with no times. */
	private List<RunStopResponse> afternoonStops(List<RunStopResponse> morning) {
		int n = morning.size();
		return IntStream.range(0, n).mapToObj(i -> morning.get(n - 1 - i).forAfternoon(i + 1)).toList();
	}

	private RunResponse toResponse(Run run, RunRouteResponse route, RouteVehicleSummary vehicle,
			RouteDriverSummary driver, LocalTime schoolTime, List<RunStopResponse> stops, boolean sharing,
			RunCountsResponse counts) {
		return new RunResponse(run.getId(), run.getRunDate(), run.getDirection(), run.getState(), schoolTime,
				run.getStartedAt(), run.getEndedAt(), route, vehicle, driver, counts, sharing, stops);
	}
}
