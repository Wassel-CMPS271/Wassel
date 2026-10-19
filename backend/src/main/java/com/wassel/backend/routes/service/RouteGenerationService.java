package com.wassel.backend.routes.service;

import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.dto.ExcludedVehicleResponse;
import com.wassel.backend.routes.dto.FleetProposalResponse;
import com.wassel.backend.routes.dto.LeavingStudentResponse;
import com.wassel.backend.routes.dto.PlannedRouteResponse;
import com.wassel.backend.routes.dto.RouteDriverSummary;
import com.wassel.backend.routes.dto.RouteSchoolResponse;
import com.wassel.backend.routes.dto.RouteSummaryResponse;
import com.wassel.backend.routes.dto.RouteVehicleSummary;
import com.wassel.backend.routes.dto.StopResponse;
import com.wassel.backend.routes.dto.UnplacedStudentResponse;
import com.wassel.backend.routes.entity.FleetProposal;
import com.wassel.backend.routes.entity.FleetProposalRoute;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.exception.ProposalNotFoundException;
import com.wassel.backend.routes.exception.RouteOptimizationConflictException;
import com.wassel.backend.routes.repository.FleetProposalRepository;
import com.wassel.backend.routes.repository.FleetProposalRouteRepository;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.routing.service.Coordinate;
import com.wassel.backend.routing.service.FleetPlanner;
import com.wassel.backend.routing.service.RouteOptimizer;
import com.wassel.backend.schools.config.SchoolLocationProperties;
import com.wassel.backend.schools.service.SchoolSettingsService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.exception.StudentNotActiveException;
import com.wassel.backend.students.exception.StudentNotFoundException;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.service.VehicleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Generates, applies and discards a proposal for all of a school's routes (SCRUM-207), mirroring
 * the single-route flow of SCRUM-203: one pending proposal (here per school), claimed by a delete
 * that reports how many rows it removed, and a 409 when the data changed since it was made.
 *
 * <p>The solve takes seconds, so {@link #generate} holds no transaction while it runs: it reads in
 * one, plans, and saves in another. {@link #apply} is one transaction, so it all happens or none of
 * it does. Both read the school through {@link #collect}, so the data the plan was made from and
 * the data apply compares it with are gathered the same way.
 *
 * <p>ponytail: a manual edit that commits between apply's comparison and its writes is
 * overwritten, the same limit as the single-route apply. Closing it takes a lock that every
 * stop-changing method also takes. One generation per school runs at a time, in this process only.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RouteGenerationService {

	private static final String PROPOSAL_NOT_FOUND_MESSAGE = "Proposal not found.";

	/** The parts of the fingerprint, in order, named in the 409 so the screen can say what changed. */
	private static final List<String> FINGERPRINT_PARTS = List.of("students", "vehicles", "routes", "arrival time");

	private final FleetProposalRepository proposalRepository;

	private final FleetProposalRouteRepository proposalRouteRepository;

	private final RouteRepository routeRepository;

	private final RouteService routeService;

	private final FleetPlanner fleetPlanner;

	private final VehicleService vehicleService;

	private final DriverService driverService;

	private final StudentService studentService;

	private final SchoolSettingsService schoolSettingsService;

	private final SchoolLocationProperties schoolLocation;

	private final TransactionTemplate transactionTemplate;

	private final Set<UUID> generating = ConcurrentHashMap.newKeySet();

	/** A vehicle the planner may use, the driver it would have, and the route it is already on (or null). */
	private record Candidate(VehicleResponse vehicle, DriverResponse driver, Route existing) {
	}

	/** Everything a plan depends on, read once. {@code members} are each route's students in stop order. */
	private record Snapshot(LocalTime arrival, List<StudentResponse> active, List<Candidate> candidates,
			List<ExcludedVehicleResponse> excluded, List<Route> routes, Map<UUID, List<StudentResponse>> members) {
	}

	private record Planned(Candidate candidate, String name, List<UUID> order) {
	}

	/**
	 * Plans every active pinned student onto the school's vehicles and saves the result as the
	 * school's one pending proposal, replacing the last. Changes no route and no student. 409 if
	 * the school's arrival time is not set or another generation for the school is running.
	 */
	public FleetProposalResponse generate(UUID schoolId) {
		if (!generating.add(schoolId)) {
			throw new RouteOptimizationConflictException("Routes are already being generated. Try again in a moment.");
		}
		try {
			Snapshot snapshot = transactionTemplate.execute(status -> collect(schoolId));
			if (snapshot.arrival() == null) {
				throw new RouteOptimizationConflictException("The school's arrival time is not set.");
			}
			List<RouteOptimizer.Stop> stops = snapshot.active().stream().filter(this::hasPin)
					.map(student -> new RouteOptimizer.Stop(student.id(), pinOf(student))).toList();
			List<FleetPlanner.Vehicle> vehicles = snapshot.candidates().stream()
					.map(candidate -> new FleetPlanner.Vehicle(candidate.vehicle().id(), candidate.vehicle().capacity()))
					.toList();
			FleetPlanner.FleetPlan plan = fleetPlanner.plan(stops, vehicles, schoolCoordinate(), snapshot.arrival());
			return transactionTemplate.execute(status -> save(schoolId, snapshot, plan));
		}
		finally {
			generating.remove(schoolId);
		}
	}

	/**
	 * Makes a pending proposal the school's routes, all or nothing: planned vehicles that already
	 * have a route update it (name and driver kept, students and order replaced), the others get a
	 * new one, and routes of vehicles that are not planned are left alone. The proposal is claimed
	 * first, so a second apply is a 404; a 409 for data that changed since rolls the claim back, so
	 * the proposal stays. Answers with the school's routes, as the list does.
	 */
	@Transactional
	public List<RouteSummaryResponse> apply(UUID schoolId, UUID proposalId) {
		FleetProposal proposal = proposalRepository.findBySchoolIdAndId(schoolId, proposalId)
				.orElseThrow(() -> new ProposalNotFoundException(PROPOSAL_NOT_FOUND_MESSAGE));
		List<FleetProposalRoute> planned = proposalRouteRepository.findByProposalId(proposalId);
		if (proposalRepository.claim(schoolId, proposalId) == 0) {
			throw new ProposalNotFoundException(PROPOSAL_NOT_FOUND_MESSAGE);
		}
		Snapshot now = collect(schoolId);
		String changed = changedParts(proposal.getFingerprint(), fingerprint(now));
		if (!changed.isEmpty()) {
			throw new RouteOptimizationConflictException(
					"The %s changed since these routes were generated. Generate them again.".formatted(changed));
		}

		// There is no undo, so the assignment being replaced is kept in the log.
		log.info("Applying generated routes for school {}; previous assignment as studentId:routeId:position: {}",
				schoolId, previousAssignment(now));

		Map<UUID, List<UUID>> studentsByRoute = new LinkedHashMap<>();
		for (FleetProposalRoute row : planned) {
			UUID routeId = row.getRouteId();
			if (routeId == null) {
				try {
					routeId = routeRepository.saveAndFlush(Route.builder().schoolId(schoolId).name(row.getName())
							.vehicleId(row.getVehicleId()).driverId(row.getDriverId()).build()).getId();
				}
				catch (DataIntegrityViolationException e) {
					// Not RouteService.createRoute: carrying on after a failed flush would leave this transaction unusable.
					log.warn("Applying generated routes for school {} hit a constraint", schoolId, e);
					throw new RouteOptimizationConflictException(
							"A vehicle or driver was just put on another route. Generate the routes again.");
				}
			}
			studentsByRoute.put(routeId, row.getStopOrder());
		}
		try {
			studentService.placeOnRoutes(schoolId, studentsByRoute);
		}
		catch (StudentNotFoundException | StudentNotActiveException e) {
			// A student changed after the comparison above: the same answer as a fingerprint mismatch, not a 404.
			throw new RouteOptimizationConflictException(
					"The students changed since these routes were generated. Generate them again.");
		}
		proposalRouteRepository.deleteForProposal(proposalId);
		return routeService.listRoutes(schoolId);
	}

	/** Drops a pending proposal; nothing else changes. 404 if it is already gone. */
	@Transactional
	public void discard(UUID schoolId, UUID proposalId) {
		if (proposalRepository.claim(schoolId, proposalId) == 0) {
			throw new ProposalNotFoundException(PROPOSAL_NOT_FOUND_MESSAGE);
		}
		proposalRouteRepository.deleteForProposal(proposalId);
	}

	private FleetProposalResponse save(UUID schoolId, Snapshot snapshot, FleetPlanner.FleetPlan plan) {
		// The proposal row first, then its routes: the order apply and discard use, so a generate saving while an
		// apply runs waits for it instead of deadlocking (PostgreSQL aborted one of the two the other way round).
		proposalRepository.deleteForSchool(schoolId);
		proposalRouteRepository.deleteForSchool(schoolId);

		Map<UUID, StudentResponse> studentsById = snapshot.active().stream()
				.collect(Collectors.toMap(StudentResponse::id, student -> student));
		Map<UUID, Candidate> candidatesByVehicle = snapshot.candidates().stream()
				.collect(Collectors.toMap(candidate -> candidate.vehicle().id(), candidate -> candidate));

		List<Planned> planned = new ArrayList<>();
		List<PlannedRouteResponse> routes = new ArrayList<>();
		for (FleetPlanner.VehicleRoute vehicleRoute : plan.routes()) {
			Candidate candidate = candidatesByVehicle.get(vehicleRoute.vehicleId());
			List<RouteOptimizer.PlannedStop> planStops = vehicleRoute.plan().stops();
			List<UUID> order = planStops.stream().map(RouteOptimizer.PlannedStop::studentId).toList();
			String name = candidate.existing() != null ? candidate.existing().getName()
					: candidate.vehicle().plateNumber() + " morning run";

			List<StopResponse> stops = new ArrayList<>();
			for (int i = 0; i < planStops.size(); i++) {
				StudentResponse student = studentsById.get(planStops.get(i).studentId());
				stops.add(new StopResponse(student.id(), i + 1, student.firstName(), student.lastName(),
						student.address(), student.latitude(), student.longitude(), planStops.get(i).arrivalTime()));
			}
			List<LeavingStudentResponse> leaving = candidate.existing() == null ? List.of()
					: snapshot.members().get(candidate.existing().getId()).stream()
							.filter(member -> !order.contains(member.id()))
							.map(member -> new LeavingStudentResponse(member.id(), member.firstName(), member.lastName()))
							.toList();

			planned.add(new Planned(candidate, name, order));
			routes.add(new PlannedRouteResponse(candidate.existing() == null ? null : candidate.existing().getId(), name,
					vehicleSummary(candidate.vehicle()),
					new RouteDriverSummary(candidate.driver().id(), candidate.driver().firstName(),
							candidate.driver().lastName()),
					vehicleRoute.plan().totalDrivingTime().toMinutes(), stops, leaving));
		}

		// A planned vehicle the solver gave no students still has its route updated, which empties it: listed with no
		// stops and everyone on it in leaving. One with nobody on it changes nothing, so it is not listed.
		Set<UUID> vehiclesWithStudents = plan.routes().stream().map(FleetPlanner.VehicleRoute::vehicleId)
				.collect(Collectors.toSet());
		for (Candidate candidate : snapshot.candidates()) {
			if (candidate.existing() == null || vehiclesWithStudents.contains(candidate.vehicle().id())) {
				continue;
			}
			List<LeavingStudentResponse> leaving = snapshot.members().get(candidate.existing().getId()).stream()
					.map(member -> new LeavingStudentResponse(member.id(), member.firstName(), member.lastName())).toList();
			if (leaving.isEmpty()) {
				continue;
			}
			planned.add(new Planned(candidate, candidate.existing().getName(), List.of()));
			routes.add(new PlannedRouteResponse(candidate.existing().getId(), candidate.existing().getName(),
					vehicleSummary(candidate.vehicle()),
					new RouteDriverSummary(candidate.driver().id(), candidate.driver().firstName(),
							candidate.driver().lastName()),
					0, List.of(), leaving));
		}

		List<UnplacedStudentResponse> unplaced = new ArrayList<>();
		snapshot.active().stream().filter(student -> !hasPin(student)).forEach(student -> unplaced.add(
				unplacedOf(student, new RouteOptimizer.Reason(RouteOptimizer.Code.NO_PIN, "This student has no map pin."))));
		plan.unplaced().forEach(left -> unplaced.add(unplacedOf(studentsById.get(left.studentId()), left.reason())));

		UUID id = null;
		if (!planned.isEmpty()) {
			try {
				FleetProposal proposal = proposalRepository.saveAndFlush(
						FleetProposal.builder().schoolId(schoolId).fingerprint(fingerprint(snapshot)).build());
				id = proposal.getId();
				UUID proposalId = id;
				proposalRouteRepository.saveAll(planned.stream()
						.map(route -> FleetProposalRoute.builder().schoolId(schoolId).proposalId(proposalId)
								.vehicleId(route.candidate().vehicle().id()).driverId(route.candidate().driver().id())
								.routeId(route.candidate().existing() == null ? null : route.candidate().existing().getId())
								.name(route.name()).stopOrder(route.order()).build())
						.toList());
			}
			catch (DataIntegrityViolationException e) {
				// Two generations at once: both cleared the old proposal and the unique school_id let one insert win.
				log.warn("Saving generated routes for school {} hit a constraint", schoolId, e);
				throw new RouteOptimizationConflictException("Routes were just generated by someone else. Try again.");
			}
		}

		return new FleetProposalResponse(id, routes, unplaced, snapshot.excluded(),
				new RouteSchoolResponse(schoolLocation.latitude(), schoolLocation.longitude(), snapshot.arrival()));
	}

	/**
	 * Reads what a plan depends on. A vehicle is planned when it is active and has an active
	 * driver: the driver of the route it is already on, or, if it has none, its assigned driver
	 * (who must not be on another route). Any other active vehicle is excluded with a reason.
	 */
	private Snapshot collect(UUID schoolId) {
		LocalTime arrival = schoolSettingsService.getTimes(schoolId).arrivalTime();
		List<StudentResponse> active = studentService.listStudents(schoolId, null, "active", null, null);
		List<Route> routes = routeRepository.findBySchoolIdOrderByCreatedAtAsc(schoolId);
		Map<UUID, List<StudentResponse>> members = new LinkedHashMap<>();
		routes.forEach(route -> members.put(route.getId(), studentService.listOnRoute(schoolId, route.getId())));

		Map<UUID, DriverResponse> driversById = new HashMap<>();
		Map<UUID, DriverResponse> driversByVehicle = new HashMap<>();
		for (DriverResponse driver : driverService.listDrivers(schoolId)) {
			driversById.put(driver.id(), driver);
			if (driver.assignedVehicleId() != null) {
				driversByVehicle.put(driver.assignedVehicleId(), driver);
			}
		}
		Map<UUID, Route> routesByVehicle = routes.stream().collect(Collectors.toMap(Route::getVehicleId, route -> route));
		Map<UUID, Route> routesByDriver = routes.stream().collect(Collectors.toMap(Route::getDriverId, route -> route));

		List<Candidate> candidates = new ArrayList<>();
		List<ExcludedVehicleResponse> excluded = new ArrayList<>();
		for (VehicleResponse vehicle : vehicleService.listVehicles(schoolId)) {
			if (!vehicle.isActive()) {
				continue;
			}
			Route existing = routesByVehicle.get(vehicle.id());
			DriverResponse driver = existing != null ? driversById.get(existing.getDriverId())
					: driversByVehicle.get(vehicle.id());
			if (driver == null) {
				excluded.add(new ExcludedVehicleResponse(vehicleSummary(vehicle),
						"Vehicle %s has no driver.".formatted(vehicle.plateNumber())));
			}
			else if (!"active".equals(driver.status())) {
				excluded.add(new ExcludedVehicleResponse(vehicleSummary(vehicle), "%s %s, the driver of %s, is not active."
						.formatted(driver.firstName(), driver.lastName(), vehicle.plateNumber())));
			}
			else if (existing == null && routesByDriver.containsKey(driver.id())) {
				excluded.add(new ExcludedVehicleResponse(vehicleSummary(vehicle), "%s %s, the driver of %s, is already on route \"%s\"."
						.formatted(driver.firstName(), driver.lastName(), vehicle.plateNumber(),
								routesByDriver.get(driver.id()).getName())));
			}
			else {
				candidates.add(new Candidate(vehicle, driver, existing));
			}
		}
		return new Snapshot(arrival, active, candidates, excluded, routes, members);
	}

	/**
	 * Four short hashes joined by commas: the active students and their pins, the planned vehicles
	 * with capacity and driver, every route with its students in order, and the school's arrival
	 * time. Only what the plan depended on, so names, addresses and timestamps do not count.
	 */
	private String fingerprint(Snapshot snapshot) {
		String students = snapshot.active().stream().map(student -> student.id() + "|" + pinText(student)).sorted()
				.collect(Collectors.joining("\n"));
		String vehicles = snapshot.candidates().stream()
				.map(candidate -> candidate.vehicle().id() + "|" + candidate.vehicle().capacity() + "|"
						+ candidate.driver().id() + "|"
						+ (candidate.existing() == null ? "-" : candidate.existing().getId()))
				.sorted().collect(Collectors.joining("\n"));
		String routes = snapshot.routes().stream().sorted(Comparator.comparing(Route::getId))
				.map(route -> route.getId() + "|" + route.getVehicleId() + "|" + route.getDriverId() + "|"
						+ snapshot.members().get(route.getId()).stream().map(member -> member.id().toString())
								.collect(Collectors.joining(",")))
				.collect(Collectors.joining("\n"));
		return Stream.of(students, vehicles, routes, String.valueOf(snapshot.arrival()))
				.map(RouteGenerationService::hash).collect(Collectors.joining(","));
	}

	/** The names of the fingerprint parts that differ, joined with "and"; empty if none. */
	private static String changedParts(String stored, String current) {
		String[] was = stored.split(",");
		String[] now = current.split(",");
		List<String> changed = new ArrayList<>();
		for (int i = 0; i < FINGERPRINT_PARTS.size(); i++) {
			if (!was[i].equals(now[i])) {
				changed.add(FINGERPRINT_PARTS.get(i));
			}
		}
		return String.join(" and ", changed);
	}

	private static String hash(String text) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)))
					.substring(0, 16);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	private String previousAssignment(Snapshot snapshot) {
		List<String> entries = new ArrayList<>();
		snapshot.members().forEach((routeId, members) -> {
			for (int i = 0; i < members.size(); i++) {
				entries.add(members.get(i).id() + ":" + routeId + ":" + (i + 1));
			}
		});
		return String.join(",", entries);
	}

	private UnplacedStudentResponse unplacedOf(StudentResponse student, RouteOptimizer.Reason reason) {
		return new UnplacedStudentResponse(student.id(), student.firstName(), student.lastName(), student.address(),
				reason);
	}

	private RouteVehicleSummary vehicleSummary(VehicleResponse vehicle) {
		return new RouteVehicleSummary(vehicle.id(), vehicle.plateNumber(), vehicle.capacity());
	}

	private String pinText(StudentResponse student) {
		return hasPin(student) ? student.latitude().toPlainString() + "," + student.longitude().toPlainString() : "-";
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
