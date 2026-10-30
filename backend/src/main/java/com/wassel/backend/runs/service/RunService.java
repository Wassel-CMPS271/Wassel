package com.wassel.backend.runs.service;

import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.dto.DriverRouteResponse;
import com.wassel.backend.routes.dto.DriverRouteStop;
import com.wassel.backend.routes.dto.RouteDriverSummary;
import com.wassel.backend.routes.dto.RouteSummaryResponse;
import com.wassel.backend.routes.dto.RouteVehicleSummary;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.runs.dto.DayType;
import com.wassel.backend.runs.dto.RunCountsResponse;
import com.wassel.backend.runs.dto.RunResponse;
import com.wassel.backend.runs.dto.RunRouteResponse;
import com.wassel.backend.runs.dto.RunStopResponse;
import com.wassel.backend.runs.dto.RunsDayResponse;
import com.wassel.backend.runs.entity.Run;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunState;
import com.wassel.backend.runs.exception.RunNotFoundException;
import com.wassel.backend.runs.exception.RunStateConflictException;
import com.wassel.backend.runs.repository.RunRepository;
import com.wassel.backend.schools.dto.SchoolTimesResponse;
import com.wassel.backend.schools.service.HalfDayService;
import com.wassel.backend.schools.service.HolidayService;
import com.wassel.backend.schools.service.SchoolSettingsService;
import com.wassel.backend.users.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

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

	private final RouteService routeService;

	private final DriverService driverService;

	private final HolidayService holidayService;

	private final HalfDayService halfDayService;

	private final SchoolSettingsService schoolSettingsService;

	private final Clock clock;

	private final TransactionTemplate transactionTemplate;

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
		List<RunStopResponse> morning = morningStops(route);
		Map<RunDirection, Run> runs = transactionTemplate.execute(status -> {
			runRepository.createMissing(schoolId, route.id(), today);
			return runsOf(schoolId, today, List.of(route.id())).get(route.id());
		});
		List<RunResponse> result = Arrays.stream(RunDirection.values())
				.map(direction -> driverRun(runs.get(direction), route, morning, dayType, times))
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
			}
			Run current = todaysRun(schoolId, today, route.id(), runId).orElseThrow(RunService::runNotFound);
			if (current.getState() != target) {
				throw new RunStateConflictException("Run is " + current.getState() + ", so it cannot be "
						+ (target == RunState.IN_PROGRESS ? "started" : "ended"));
			}
			return current;
		});
		return driverRun(run, route, morningStops(route), dayType, schoolSettingsService.getTimes(schoolId));
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
	 * One run with its stops, as the driver sees it. Today's runs, start and end use it, and so should confirm
	 * (SCRUM-235), which answers with the whole run: one place to fill in absences and confirmations.
	 */
	private RunResponse driverRun(Run run, DriverRouteResponse route, List<RunStopResponse> morning, DayType dayType,
			SchoolTimesResponse times) {
		List<RunStopResponse> stops = run.getDirection() == RunDirection.MORNING ? morning : afternoonStops(morning);
		return toResponse(run, new RunRouteResponse(route.id(), route.name()), route.vehicle(), route.driver(),
				stops.size(), schoolTimeOf(run.getDirection(), dayType, times), stops);
	}

	/**
	 * Every run of the school on the date, without stops, routes in the order of {@code GET /routes} and each
	 * route's morning run before its afternoon run. Today's runs are created first; any other date only reads.
	 * {@code date} is null for today.
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
		SchoolTimesResponse times = schoolSettingsService.getTimes(schoolId);
		List<RunResponse> result = new ArrayList<>();
		for (RouteSummaryResponse route : routes) {
			Map<RunDirection, Run> ofRoute = runs.getOrDefault(route.id(), Map.of());
			for (RunDirection direction : RunDirection.values()) {
				Run run = ofRoute.get(direction);
				if (run != null) {
					result.add(toResponse(run, new RunRouteResponse(route.id(), route.name()), route.vehicle(),
							route.driver(), route.studentCount(), schoolTimeOf(direction, dayType, times), null));
				}
			}
		}
		return new RunsDayResponse(day, dayType, result);
	}

	/** Monday to Friday, no holiday in the calendar: a school day, or a half-day if it is marked as one. */
	private DayType dayTypeOf(UUID schoolId, LocalDate date) {
		DayOfWeek weekday = date.getDayOfWeek();
		if (weekday == DayOfWeek.SATURDAY || weekday == DayOfWeek.SUNDAY || holidayService.isHoliday(schoolId, date)) {
			return DayType.HOLIDAY;
		}
		return halfDayService.isHalfDay(schoolId, date) ? DayType.HALF_DAY : DayType.SCHOOL_DAY;
	}

	/** The school's arrival time for a morning run, its dismissal time for an afternoon one. */
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
	 * together with it. Absences and confirmations are not recorded yet (SCRUM-239, SCRUM-235): every stop is
	 * present, unconfirmed, and still on the route.
	 */
	private List<RunStopResponse> morningStops(DriverRouteResponse route) {
		return route.stops().stream().map(this::toStop).toList();
	}

	private RunStopResponse toStop(DriverRouteStop stop) {
		return new RunStopResponse(stop.studentId(), stop.position(), stop.firstName(), stop.lastName(),
				stop.address(), stop.latitude(), stop.longitude(), stop.arrivalTime(), stop.guardianName(),
				stop.guardianPhone(), false, null, false);
	}

	/** The morning order reversed, numbered 1..n again, with no times. */
	private List<RunStopResponse> afternoonStops(List<RunStopResponse> morning) {
		int n = morning.size();
		return IntStream.range(0, n).mapToObj(i -> morning.get(n - 1 - i).forAfternoon(i + 1)).toList();
	}

	private RunResponse toResponse(Run run, RunRouteResponse route, RouteVehicleSummary vehicle,
			RouteDriverSummary driver, int students, LocalTime schoolTime, List<RunStopResponse> stops) {
		return new RunResponse(run.getId(), run.getRunDate(), run.getDirection(), run.getState(), schoolTime,
				run.getStartedAt(), run.getEndedAt(), route, vehicle, driver, new RunCountsResponse(students, 0, 0, 0, 0),
				stops);
	}
}
