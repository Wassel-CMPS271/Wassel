package com.wassel.backend.routes.service;

import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.dto.AssignStudentRequest;
import com.wassel.backend.routes.dto.ReorderStopsRequest;
import com.wassel.backend.routes.dto.RouteDriverSummary;
import com.wassel.backend.routes.dto.RouteRequest;
import com.wassel.backend.routes.dto.RouteResponse;
import com.wassel.backend.routes.dto.RouteSchoolResponse;
import com.wassel.backend.routes.dto.RouteSummaryResponse;
import com.wassel.backend.routes.dto.RouteVehicleSummary;
import com.wassel.backend.routes.dto.StopResponse;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.exception.RouteAssignmentConflictException;
import com.wassel.backend.routes.exception.RouteCapacityExceededException;
import com.wassel.backend.routes.exception.RouteNotFoundException;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.schools.config.SchoolLocationProperties;
import com.wassel.backend.schools.service.SchoolSettingsService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.service.VehicleService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Manages a school's routes: create, list, edit, delete, and which students ride each one
 * (SCRUM-209). Every method takes the school id explicitly and only ever touches that school's
 * routes, so callers can't cross the tenant boundary. Vehicle, driver and student eligibility
 * are checked through {@link VehicleService}/{@link DriverService}/{@link StudentService},
 * never by touching those modules' repositories or entities directly.
 *
 * <p>{@code studentCount}, {@code seatsLeft} and {@code stops} are always computed fresh from
 * {@code StudentService}, never cached on {@code Route} itself. Every stop's {@code arrivalTime}
 * is still always null: estimating it is SCRUM-212.
 */
@Service
@RequiredArgsConstructor
public class RouteService {

	private static final String NOT_FOUND_MESSAGE = "Route not found.";

	private static final String VEHICLE_DEACTIVATED_MESSAGE = "Cannot put a deactivated vehicle on a route.";

	private static final String DRIVER_DEACTIVATED_MESSAGE = "Cannot put a deactivated driver on a route.";

	private final RouteRepository routeRepository;

	private final VehicleService vehicleService;

	private final DriverService driverService;

	private final StudentService studentService;

	private final SchoolSettingsService schoolSettingsService;

	private final SchoolLocationProperties schoolLocation;

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
			// Two requests claiming the same vehicle or driver at once: the unique constraints are
			// the backstop for the check above. Re-check now that the conflicting row is committed,
			// so the race is reported on the same field the non-race case would use.
			checkNoConflict(schoolId, vehicle.id(), driver.id(), null);
			throw new RouteAssignmentConflictException("vehicleId", "Vehicle or driver is already on another route.");
		}
		return toResponse(schoolId, route, vehicle, driver);
	}

	@Transactional
	public RouteResponse editRoute(UUID schoolId, UUID routeId, RouteRequest request) {
		Route route = findOwned(schoolId, routeId);
		VehicleResponse vehicle = requireActiveVehicle(schoolId, request.vehicleId());
		DriverResponse driver = requireUsableDriver(schoolId, request.driverId());
		checkNoConflict(schoolId, vehicle.id(), driver.id(), routeId);

		route.setName(request.name());
		route.setVehicleId(vehicle.id());
		route.setDriverId(driver.id());
		try {
			routeRepository.saveAndFlush(route);
		} catch (DataIntegrityViolationException e) {
			checkNoConflict(schoolId, vehicle.id(), driver.id(), routeId);
			throw new RouteAssignmentConflictException("vehicleId", "Vehicle or driver is already on another route.");
		}
		return toResponse(schoolId, route, vehicle, driver);
	}

	@Transactional
	public void deleteRoute(UUID schoolId, UUID routeId) {
		Route route = findOwned(schoolId, routeId);
		studentService.clearRoute(schoolId, routeId);
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
		}
		studentService.assignToRoute(schoolId, request.studentId(), routeId);
		return toResponse(schoolId, route);
	}

	/** 404s if the student exists but isn't currently a stop on this particular route. */
	@Transactional
	public RouteResponse removeStudent(UUID schoolId, UUID routeId, UUID studentId) {
		Route route = findOwned(schoolId, routeId);
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
		RouteSchoolResponse school = new RouteSchoolResponse(schoolLocation.latitude(), schoolLocation.longitude(),
				schoolSettingsService.getTimes(schoolId).arrivalTime());
		return new RouteResponse(summary.id(), summary.name(), summary.vehicle(), summary.driver(),
				summary.studentCount(), summary.seatsLeft(), school, stopsOf(schoolId, route.getId()));
	}

	/** In position order. {@code arrivalTime} is always null for now: estimating it is SCRUM-212. */
	private List<StopResponse> stopsOf(UUID schoolId, UUID routeId) {
		List<StudentResponse> onRoute = studentService.listOnRoute(schoolId, routeId);
		List<StopResponse> stops = new ArrayList<>(onRoute.size());
		for (int i = 0; i < onRoute.size(); i++) {
			StudentResponse student = onRoute.get(i);
			stops.add(new StopResponse(student.id(), i + 1, student.firstName(), student.lastName(),
					student.address(), student.latitude(), student.longitude(), null));
		}
		return stops;
	}
}
