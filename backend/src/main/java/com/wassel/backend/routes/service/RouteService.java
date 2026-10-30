package com.wassel.backend.routes.service;

import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.dto.AssignStudentRequest;
import com.wassel.backend.routes.dto.DriverRouteResponse;
import com.wassel.backend.routes.dto.DriverRouteStop;
import com.wassel.backend.routes.dto.ProposalOrderResponse;
import com.wassel.backend.routes.dto.ProposalResponse;
import com.wassel.backend.routes.dto.ReorderStopsRequest;
import com.wassel.backend.routes.dto.RouteDriverSummary;
import com.wassel.backend.routes.dto.RouteRequest;
import com.wassel.backend.routes.dto.RouteResponse;
import com.wassel.backend.routes.dto.RouteSchoolResponse;
import com.wassel.backend.routes.dto.RouteSummaryResponse;
import com.wassel.backend.routes.dto.RouteVehicleSummary;
import com.wassel.backend.routes.dto.StopResponse;
import com.wassel.backend.routes.dto.StudentRouteResponse;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.entity.RouteProposal;
import com.wassel.backend.routes.entity.RouteVersion;
import com.wassel.backend.routes.exception.ActiveRunConflictException;
import com.wassel.backend.routes.exception.ProposalNotFoundException;
import com.wassel.backend.routes.exception.RouteAssignmentConflictException;
import com.wassel.backend.routes.exception.RouteCapacityExceededException;
import com.wassel.backend.routes.exception.RouteNotFoundException;
import com.wassel.backend.routes.exception.RouteOptimizationConflictException;
import com.wassel.backend.routes.repository.RouteProposalRepository;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.routes.repository.RouteVersionRepository;
import com.wassel.backend.routing.service.Coordinate;
import com.wassel.backend.routing.service.RouteOptimizer;
import com.wassel.backend.routing.service.RouteTimings;
import com.wassel.backend.routing.service.TravelTimes;
import com.wassel.backend.schools.config.SchoolLocationProperties;
import com.wassel.backend.schools.service.SchoolSettingsService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.service.VehicleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Manages a school's routes: create, list, edit, delete, which students ride each one
 * (SCRUM-209), and their arrival times (SCRUM-212). Every method takes the school id explicitly
 * and only ever touches that school's routes, so callers can't cross the tenant boundary.
 * Vehicle, driver and student eligibility are checked through
 * {@link VehicleService}/{@link DriverService}/{@link StudentService}, never by touching those
 * modules' repositories or entities directly.
 *
 * <p>{@code studentCount}, {@code seatsLeft}, {@code stops} and every stop's {@code arrivalTime}
 * are always computed fresh from {@code StudentService}/{@link RouteTimings}, never cached on
 * {@code Route} itself — a reorder or a new pin changes them on the next read with nothing to
 * invalidate.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RouteService {

	private static final String NOT_FOUND_MESSAGE = "Route not found.";

	private static final String VEHICLE_DEACTIVATED_MESSAGE = "Cannot put a deactivated vehicle on a route.";

	private static final String DRIVER_DEACTIVATED_MESSAGE = "Cannot put a deactivated driver on a route.";

	private static final String PROPOSAL_NOT_FOUND_MESSAGE = "Proposal not found.";

	private final RouteRepository routeRepository;

	private final RouteProposalRepository proposalRepository;

	private final RouteVersionRepository versionRepository;

	private final RouteOptimizer routeOptimizer;

	private final VehicleService vehicleService;

	private final DriverService driverService;

	private final StudentService studentService;

	private final SchoolSettingsService schoolSettingsService;

	private final SchoolLocationProperties schoolLocation;

	private final TravelTimes travelTimes;

	private final ActiveRunGuard activeRunGuard;

	/** The school's routes, oldest first. */
	@Transactional(readOnly = true)
	public List<RouteSummaryResponse> listRoutes(UUID schoolId) {
		return routeRepository.findBySchoolIdOrderByCreatedAtAsc(schoolId).stream()
				.map(route -> summaryOf(route, vehicleService.getOwnedVehicle(schoolId, route.getVehicleId()),
						driverService.getOwnedDriver(schoolId, route.getDriverId())))
				.toList();
	}

	@Transactional(readOnly = true)
	public RouteResponse getRoute(UUID schoolId, UUID routeId) {
		return toResponse(schoolId, findOwned(schoolId, routeId));
	}

	/**
	 * For the runs module: the route a driver is on, if any. A driver is on at most one route. The students are
	 * read once and the times, order and guardians all come from that read. Deliberately not
	 * {@code @Transactional}: the arrival times may wait on the road provider (up to its 3 s timeout), and a
	 * transaction around that would hold a database connection the whole time. Each read below is its own short one.
	 */
	public Optional<DriverRouteResponse> findRouteOfDriver(UUID schoolId, UUID driverId) {
		return routeRepository.findBySchoolIdAndDriverId(schoolId, driverId).map(route -> {
			VehicleResponse vehicle = vehicleService.getOwnedVehicle(schoolId, route.getVehicleId());
			DriverResponse driver = driverService.getOwnedDriver(schoolId, route.getDriverId());
			List<StudentResponse> onRoute = studentService.listOnRoute(schoolId, route.getId());
			Map<UUID, LocalTime> arrivals = schedule(onRoute, schoolSettingsService.getTimes(schoolId).arrivalTime())
					.arrivals();
			List<DriverRouteStop> stops = new ArrayList<>(onRoute.size());
			for (int i = 0; i < onRoute.size(); i++) {
				StudentResponse student = onRoute.get(i);
				stops.add(new DriverRouteStop(student.id(), i + 1, student.firstName(), student.lastName(),
						student.address(), student.latitude(), student.longitude(), arrivals.get(student.id()),
						student.guardianName(), student.guardianPhone()));
			}
			return new DriverRouteResponse(route.getId(), route.getName(),
					new RouteVehicleSummary(vehicle.id(), vehicle.plateNumber(), vehicle.capacity()),
					new RouteDriverSummary(driver.id(), driver.firstName(), driver.lastName()), stops);
		});
	}

	/**
	 * Works out every route's arrival times once, which fills the road-time cache (a route whose pairs are all
	 * cached never calls the provider again). Called at startup, after a restart empties the cache. One route
	 * that fails is logged and skipped. Not transactional, for the reason {@link #findRouteOfDriver} gives.
	 * shortcut: one request per route, so more routes than the provider's per-minute cap leaves the rest cold
	 * until first use; spread the calls out if a school ever has that many.
	 */
	public void warmTravelTimes() {
		for (Route route : routeRepository.findAll()) {
			try {
				UUID schoolId = route.getSchoolId();
				schedule(studentService.listOnRoute(schoolId, route.getId()),
						schoolSettingsService.getTimes(schoolId).arrivalTime());
			} catch (RuntimeException e) {
				log.warn("Could not warm travel times for route {}: {}", route.getId(), e.getMessage(), e);
			}
		}
	}

	@Transactional
	public RouteResponse createRoute(UUID schoolId, RouteRequest request) {
		VehicleResponse vehicle = requireActiveVehicle(schoolId, request.vehicleId());
		DriverResponse driver = requireUsableDriver(schoolId, request.driverId());
		checkNoConflict(schoolId, vehicle.id(), driver.id(), null);

		Route route = Route.builder()
				.schoolId(schoolId)
				.name(request.name())
				.vehicleId(vehicle.id())
				.driverId(driver.id())
				.build();
		try {
			route = routeRepository.saveAndFlush(route);
		} catch (DataIntegrityViolationException e) {
			throw lostRace(e);
		}
		return toResponse(schoolId, route, vehicle, driver);
	}

	@Transactional
	public RouteResponse editRoute(UUID schoolId, UUID routeId, RouteRequest request) {
		Route route = findOwned(schoolId, routeId);
		if (!request.vehicleId().equals(route.getVehicleId()) || !request.driverId().equals(route.getDriverId())) {
			activeRunGuard.blockReasonForRouteChange(schoolId, routeId, route.getName()).ifPresent(reason -> {
				throw new ActiveRunConflictException(reason);
			});
		}
		// Only a vehicle or driver being put on the route must be usable: a rename must not fail
		// because the ones it already has were deactivated since.
		VehicleResponse vehicle = request.vehicleId().equals(route.getVehicleId())
				? vehicleService.getOwnedVehicle(schoolId, request.vehicleId())
				: requireActiveVehicle(schoolId, request.vehicleId());
		DriverResponse driver = request.driverId().equals(route.getDriverId())
				? driverService.getOwnedDriver(schoolId, request.driverId())
				: requireUsableDriver(schoolId, request.driverId());
		checkNoConflict(schoolId, vehicle.id(), driver.id(), routeId);

		route.setName(request.name());
		route.setVehicleId(vehicle.id());
		route.setDriverId(driver.id());
		try {
			routeRepository.saveAndFlush(route);
		} catch (DataIntegrityViolationException e) {
			throw lostRace(e);
		}
		return toResponse(schoolId, route, vehicle, driver);
	}

	@Transactional
	public void deleteRoute(UUID schoolId, UUID routeId) {
		Route route = findOwned(schoolId, routeId);
		studentService.clearRoute(schoolId, routeId);
		proposalRepository.deleteForRoute(schoolId, routeId);
		versionRepository.deleteForRoute(schoolId, routeId);
		routeRepository.delete(route);
	}

	/**
	 * Adds a student as the route's new last stop. Capacity is checked against the route's
	 * current occupants before the student is resolved, so a full route answers
	 * {@link RouteCapacityExceededException} even for an unknown student id, the same
	 * "cheapest check first" order {@code OrToolsRouteOptimizer} uses for capacity vs. time.
	 * Re-adding a student already on this exact route skips the capacity check: they're already
	 * counted in {@code currentCount}, so adding them again takes no new seat.
	 * {@link StudentService#assignToRoute} throws 404/409 if the student doesn't exist, belongs
	 * to another school, or isn't active; it also moves a student off any other route they were
	 * already on, so no seat is held on two routes at once.
	 */
	@Transactional
	public RouteResponse addStudent(UUID schoolId, UUID routeId, AssignStudentRequest request) {
		Route route = findOwned(schoolId, routeId);
		if (!studentService.isOnRoute(schoolId, request.studentId(), routeId)) {
			VehicleResponse vehicle = vehicleService.getOwnedVehicle(schoolId, route.getVehicleId());
			long currentCount = studentService.countOnRoute(schoolId, routeId);
			if (currentCount >= vehicle.capacity()) {
				throw new RouteCapacityExceededException("The route has %d students but the vehicle seats %d."
						.formatted(currentCount, vehicle.capacity()));
			}
			// Not on this route yet, so this may move them off another one; re-adding one already here moves no one.
			requireNotOnABus(schoolId, request.studentId());
		}
		studentService.assignToRoute(schoolId, request.studentId(), routeId);
		return toResponse(schoolId, route);
	}

	/** 404s if the student exists but isn't currently a stop on this particular route. */
	@Transactional
	public RouteResponse removeStudent(UUID schoolId, UUID routeId, UUID studentId) {
		Route route = findOwned(schoolId, routeId);
		requireNotOnABus(schoolId, studentId);
		studentService.removeFromRoute(schoolId, studentId, routeId);
		return toResponse(schoolId, route);
	}

	/**
	 * Sets the route's whole stop order by hand (SCRUM-210): the fallback that keeps the route
	 * usable before the optimizer (SCRUM-202/203) proposes one. {@link StudentService#reorderRoute}
	 * rejects a list that repeats a student or doesn't contain exactly the route's current stops.
	 */
	@Transactional
	public RouteResponse reorderStops(UUID schoolId, UUID routeId, ReorderStopsRequest request) {
		Route route = findOwned(schoolId, routeId);
		studentService.reorderRoute(schoolId, routeId, request.studentIds());
		return toResponse(schoolId, route);
	}

	/**
	 * Asks the optimizer for a better order and saves it as the route's one pending proposal
	 * (SCRUM-203); the route itself is not changed. Every call that gets as far as the optimizer
	 * clears the previous proposal first, even when this answer is not feasible, so an older
	 * proposal can never be applied after a newer one found nothing. A route with no stops, no
	 * school arrival time or a stop without a pin can't be optimized (409), and that leaves the
	 * previous proposal as it was.
	 *
	 * <p>ponytail: the solve (at most 2 s) runs inside this transaction and holds a connection;
	 * fine for one school, read the route first and save after if pool pressure ever shows up.
	 */
	@Transactional
	public ProposalResponse propose(UUID schoolId, UUID routeId) {
		Route route = findOwned(schoolId, routeId);
		List<StudentResponse> onRoute = studentService.listOnRoute(schoolId, routeId);
		LocalTime schoolArrival = schoolSettingsService.getTimes(schoolId).arrivalTime();
		if (onRoute.isEmpty()) {
			throw new RouteOptimizationConflictException("The route has no stops to optimize.");
		}
		if (schoolArrival == null) {
			throw new RouteOptimizationConflictException("The school's arrival time is not set.");
		}
		List<StudentResponse> unpinned = onRoute.stream().filter(student -> !hasPin(student)).toList();
		if (!unpinned.isEmpty()) {
			String names = unpinned.stream().map(student -> student.firstName() + " " + student.lastName())
					.collect(Collectors.joining(", "));
			throw new RouteOptimizationConflictException("These students have no map pin: " + names + ".",
					unpinned.stream().map(StudentResponse::id).toList());
		}

		int capacity = vehicleService.getOwnedVehicle(schoolId, route.getVehicleId()).capacity();
		List<RouteOptimizer.Stop> stops = onRoute.stream()
				.map(student -> new RouteOptimizer.Stop(student.id(), pinOf(student))).toList();
		RouteOptimizer.Plan plan = routeOptimizer.optimize(stops, schoolCoordinate(), capacity, schoolArrival);

		Schedule currentSchedule = schedule(onRoute, schoolArrival);
		ProposalOrderResponse current = new ProposalOrderResponse(currentSchedule.drivingTime().toMinutes(),
				stopsOf(onRoute, currentSchedule.arrivals()));
		proposalRepository.deleteForRoute(schoolId, routeId);
		if (!plan.feasible()) {
			return new ProposalResponse(null, false, current, null, plan.reasons());
		}

		List<UUID> proposedOrder = plan.stops().stream().map(RouteOptimizer.PlannedStop::studentId).toList();
		RouteProposal proposal;
		try {
			proposal = proposalRepository.saveAndFlush(RouteProposal.builder().schoolId(schoolId).routeId(routeId)
					.baseOrder(onRoute.stream().map(StudentResponse::id).toList()).proposedOrder(proposedOrder)
					.build());
		} catch (DataIntegrityViolationException e) {
			// Two proposes at once: both cleared the old proposal, and the unique route_id let one insert win.
			throw new RouteOptimizationConflictException("Another optimization of this route was just made. Try again.");
		}

		Map<UUID, StudentResponse> byId = onRoute.stream().collect(Collectors.toMap(StudentResponse::id, s -> s));
		Map<UUID, LocalTime> proposedArrivals = new HashMap<>();
		plan.stops().forEach(stop -> proposedArrivals.put(stop.studentId(), stop.arrivalTime()));
		ProposalOrderResponse proposed = new ProposalOrderResponse(plan.totalDrivingTime().toMinutes(),
				stopsOf(proposedOrder.stream().map(byId::get).toList(), proposedArrivals));
		return new ProposalResponse(proposal.getId(), true, current, proposed, List.of());
	}

	/**
	 * Makes a pending proposal the route's order and keeps the order it replaces as a version.
	 * The proposal is claimed with a delete that reports whether it removed a row, so two applies
	 * of the same proposal can't both succeed (the loser gets the 404 of a proposal that is gone).
	 * A 409 for a route whose stops or order changed since the proposal rolls the claim back, so
	 * the proposal stays.
	 *
	 * <p>ponytail: a manual reorder or a student change that commits between the comparison and
	 * the write below is overwritten. Closing it takes a route-row lock that every stop-changing
	 * method also takes.
	 */
	@Transactional
	public RouteResponse applyProposal(UUID schoolId, UUID routeId, UUID proposalId) {
		Route route = findOwned(schoolId, routeId);
		RouteProposal proposal = proposalRepository.findBySchoolIdAndRouteIdAndId(schoolId, routeId, proposalId)
				.orElseThrow(() -> new ProposalNotFoundException(PROPOSAL_NOT_FOUND_MESSAGE));
		if (proposalRepository.claim(schoolId, routeId, proposalId) == 0) {
			throw new ProposalNotFoundException(PROPOSAL_NOT_FOUND_MESSAGE);
		}
		List<UUID> currentOrder = studentService.listOnRoute(schoolId, routeId).stream()
				.map(StudentResponse::id).toList();
		if (!currentOrder.equals(proposal.getBaseOrder())) {
			throw new RouteOptimizationConflictException(
					"The route's stops or their order changed since this proposal was made. Optimize again.");
		}
		versionRepository.save(RouteVersion.builder().schoolId(schoolId).routeId(routeId).stopOrder(currentOrder)
				.build());
		studentService.reorderRoute(schoolId, routeId, proposal.getProposedOrder());
		return toResponse(schoolId, route);
	}

	/** Drops a pending proposal; the route is untouched. 404 if it is already gone. */
	@Transactional
	public void discardProposal(UUID schoolId, UUID routeId, UUID proposalId) {
		findOwned(schoolId, routeId);
		if (proposalRepository.claim(schoolId, routeId, proposalId) == 0) {
			throw new ProposalNotFoundException(PROPOSAL_NOT_FOUND_MESSAGE);
		}
	}

	/**
	 * This student's current route and display position (SCRUM-238/239), or empty if they're not
	 * on a route, or their route vanished between the lookup and this call (treated the same as
	 * "no route" rather than a 404 that names a route the caller never asked about). The route id
	 * itself comes from {@link StudentService#getRouteId}, since {@code routeId} is a column on
	 * {@code Student}, not on {@code Route}; position is this student's rank in
	 * {@link StudentService#listOnRoute}'s order, matching how every other response numbers stops.
	 */
	@Transactional(readOnly = true)
	public Optional<StudentRouteResponse> findStudentRoute(UUID schoolId, UUID studentId) {
		UUID routeId = studentService.getRouteId(schoolId, studentId);
		if (routeId == null) {
			return Optional.empty();
		}
		return routeRepository.findBySchoolIdAndId(schoolId, routeId).flatMap(route -> {
			List<StudentResponse> stops = studentService.listOnRoute(schoolId, routeId);
			for (int i = 0; i < stops.size(); i++) {
				if (stops.get(i).id().equals(studentId)) {
					return Optional.of(new StudentRouteResponse(route.getId(), route.getName(), i + 1));
				}
			}
			return Optional.empty();
		});
	}

	private VehicleResponse requireActiveVehicle(UUID schoolId, UUID vehicleId) {
		VehicleResponse vehicle = vehicleService.getOwnedVehicle(schoolId, vehicleId);
		if (!vehicle.isActive()) {
			throw new RouteAssignmentConflictException("vehicleId", VEHICLE_DEACTIVATED_MESSAGE);
		}
		return vehicle;
	}

	private DriverResponse requireUsableDriver(UUID schoolId, UUID driverId) {
		DriverResponse driver = driverService.getOwnedDriver(schoolId, driverId);
		if ("deactivated".equals(driver.status())) {
			throw new RouteAssignmentConflictException("driverId", DRIVER_DEACTIVATED_MESSAGE);
		}
		return driver;
	}

	/**
	 * Two requests claimed the same vehicle or driver at once and the unique constraints were the
	 * backstop for {@link #checkNoConflict}. PostgreSQL aborts the transaction when a statement
	 * fails, so nothing may query before this is thrown; the constraint name says which one lost.
	 * The other route's name is not known here, unlike the message {@code checkNoConflict} gives.
	 */
	private RouteAssignmentConflictException lostRace(DataIntegrityViolationException e) {
		String cause = String.valueOf(NestedExceptionUtils.getMostSpecificCause(e).getMessage()).toLowerCase();
		return cause.contains("uq_routes_school_driver")
				? new RouteAssignmentConflictException("driverId", "Driver is already on another route.")
				: new RouteAssignmentConflictException("vehicleId", "Vehicle is already on another route.");
	}

	/** {@code excludedRouteId} is null for create (no route to exclude yet) or the route being edited. */
	private void checkNoConflict(UUID schoolId, UUID vehicleId, UUID driverId, UUID excludedRouteId) {
		findByVehicle(schoolId, vehicleId, excludedRouteId).ifPresent(taken -> {
			throw new RouteAssignmentConflictException("vehicleId",
					"Vehicle is already on route \"%s\".".formatted(taken.getName()));
		});
		findByDriver(schoolId, driverId, excludedRouteId).ifPresent(taken -> {
			throw new RouteAssignmentConflictException("driverId",
					"Driver is already on route \"%s\".".formatted(taken.getName()));
		});
	}

	private Optional<Route> findByVehicle(UUID schoolId, UUID vehicleId, UUID excludedRouteId) {
		return excludedRouteId == null ? routeRepository.findBySchoolIdAndVehicleId(schoolId, vehicleId)
				: routeRepository.findBySchoolIdAndVehicleIdAndIdNot(schoolId, vehicleId, excludedRouteId);
	}

	private Optional<Route> findByDriver(UUID schoolId, UUID driverId, UUID excludedRouteId) {
		return excludedRouteId == null ? routeRepository.findBySchoolIdAndDriverId(schoolId, driverId)
				: routeRepository.findBySchoolIdAndDriverIdAndIdNot(schoolId, driverId, excludedRouteId);
	}

	/** A student a driver has picked up today stays on their route until the run ends (409). */
	private void requireNotOnABus(UUID schoolId, UUID studentId) {
		activeRunGuard.blockReasonForStudentMove(schoolId, studentId).ifPresent(reason -> {
			throw new ActiveRunConflictException(reason);
		});
	}

	private Route findOwned(UUID schoolId, UUID routeId) {
		return routeRepository.findBySchoolIdAndId(schoolId, routeId)
				.orElseThrow(() -> new RouteNotFoundException(NOT_FOUND_MESSAGE));
	}

	private RouteSummaryResponse summaryOf(Route route, VehicleResponse vehicle, DriverResponse driver) {
		int studentCount = (int) studentService.countOnRoute(route.getSchoolId(), route.getId());
		return new RouteSummaryResponse(route.getId(), route.getName(),
				new RouteVehicleSummary(vehicle.id(), vehicle.plateNumber(), vehicle.capacity()),
				new RouteDriverSummary(driver.id(), driver.firstName(), driver.lastName()),
				studentCount, vehicle.capacity() - studentCount);
	}

	private RouteResponse toResponse(UUID schoolId, Route route) {
		return toResponse(schoolId, route, vehicleService.getOwnedVehicle(schoolId, route.getVehicleId()),
				driverService.getOwnedDriver(schoolId, route.getDriverId()));
	}

	private RouteResponse toResponse(UUID schoolId, Route route, VehicleResponse vehicle, DriverResponse driver) {
		RouteSummaryResponse summary = summaryOf(route, vehicle, driver);
		LocalTime schoolArrival = schoolSettingsService.getTimes(schoolId).arrivalTime();
		RouteSchoolResponse school = new RouteSchoolResponse(schoolLocation.latitude(), schoolLocation.longitude(),
				schoolArrival);
		return new RouteResponse(summary.id(), summary.name(), summary.vehicle(), summary.driver(),
				summary.studentCount(), summary.seatsLeft(), school, stopsOf(schoolId, route.getId(), schoolArrival));
	}

	/** In position order, with each pinned stop's arrival time (SCRUM-212), or null per {@link #schedule}. */
	private List<StopResponse> stopsOf(UUID schoolId, UUID routeId, LocalTime schoolArrival) {
		List<StudentResponse> onRoute = studentService.listOnRoute(schoolId, routeId);
		return stopsOf(onRoute, schedule(onRoute, schoolArrival).arrivals());
	}

	/** The given students as stops numbered 1..n in the order given, each with its time from {@code arrivalTimes} if any. */
	private List<StopResponse> stopsOf(List<StudentResponse> inOrder, Map<UUID, LocalTime> arrivalTimes) {
		List<StopResponse> stops = new ArrayList<>(inOrder.size());
		for (int i = 0; i < inOrder.size(); i++) {
			StudentResponse student = inOrder.get(i);
			stops.add(new StopResponse(student.id(), i + 1, student.firstName(), student.lastName(),
					student.address(), student.latitude(), student.longitude(), arrivalTimes.get(student.id())));
		}
		return stops;
	}

	/** Each pinned stop's arrival time and the route's total driving time, from {@link #schedule}. */
	private record Schedule(Map<UUID, LocalTime> arrivals, Duration drivingTime) {
	}

	/**
	 * The arrival-time rule from the routing contract: backwards from the school's arrival time,
	 * over only the stops that have a pin, in position order ({@link RouteTimings}). No arrival
	 * times (an empty map) when the school's arrival time isn't set yet, no stop has a pin, or the
	 * computed schedule isn't drivable ({@link RouteTimings.Timing#startsTooEarly()}) — the
	 * contract treats that as "no times" rather than publishing a schedule that starts before a
	 * bus realistically could. The driving time is still the sum of the legs in that last case, and
	 * zero in the first two.
	 */
	private Schedule schedule(List<StudentResponse> onRoute, LocalTime schoolArrival) {
		List<StudentResponse> pinned = onRoute.stream().filter(this::hasPin).toList();
		if (schoolArrival == null || pinned.isEmpty()) {
			return new Schedule(Map.of(), Duration.ZERO);
		}
		List<Coordinate> pins = pinned.stream().map(this::pinOf).toList();
		RouteTimings.Timing timing = RouteTimings.schedule(travelTimes, pins, schoolCoordinate(), schoolArrival);
		if (timing.startsTooEarly()) {
			return new Schedule(Map.of(), timing.drivingTime());
		}
		Map<UUID, LocalTime> arrivalTimes = new HashMap<>();
		for (int i = 0; i < pinned.size(); i++) {
			arrivalTimes.put(pinned.get(i).id(), timing.arrivals().get(i));
		}
		return new Schedule(arrivalTimes, timing.drivingTime());
	}

	private boolean hasPin(StudentResponse student) {
		return student.latitude() != null && student.longitude() != null;
	}

	private Coordinate pinOf(StudentResponse student) {
		return new Coordinate(student.latitude().doubleValue(), student.longitude().doubleValue());
	}

	private Coordinate schoolCoordinate() {
		return new Coordinate(schoolLocation.latitude().doubleValue(), schoolLocation.longitude().doubleValue());
	}
}
