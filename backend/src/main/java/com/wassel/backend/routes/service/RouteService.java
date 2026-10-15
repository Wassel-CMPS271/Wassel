package com.wassel.backend.routes.service;

import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.dto.RouteDriverSummary;
import com.wassel.backend.routes.dto.RouteRequest;
import com.wassel.backend.routes.dto.RouteResponse;
import com.wassel.backend.routes.dto.RouteSchoolResponse;
import com.wassel.backend.routes.dto.RouteSummaryResponse;
import com.wassel.backend.routes.dto.RouteVehicleSummary;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.exception.RouteAssignmentConflictException;
import com.wassel.backend.routes.exception.RouteNotFoundException;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.schools.config.SchoolLocationProperties;
import com.wassel.backend.schools.service.SchoolSettingsService;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.service.VehicleService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Manages a school's routes: create, list, edit and delete, with a vehicle and a driver each
 * on at most one route. Every method takes the school id explicitly and only ever touches that
 * school's routes, so callers can't cross the tenant boundary. Vehicle and driver eligibility
 * are checked through {@link VehicleService}/{@link DriverService}, never by touching those
 * modules' repositories or entities directly.
 *
 * <p>No route has stops yet (assigning students is SCRUM-209), so {@code studentCount} is
 * always 0, {@code seatsLeft} always equals the vehicle's capacity, and {@code stops} is
 * always empty.
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

		routeRepository.findBySchoolIdAndVehicleId(schoolId, vehicle.id())
				.ifPresent(taken -> {
					throw new RouteAssignmentConflictException("vehicleId",
							"Vehicle is already on route \"%s\".".formatted(taken.getName()));
				});
		routeRepository.findBySchoolIdAndDriverId(schoolId, driver.id())
				.ifPresent(taken -> {
					throw new RouteAssignmentConflictException("driverId",
							"Driver is already on route \"%s\".".formatted(taken.getName()));
				});

		Route route = Route.builder()
				.schoolId(schoolId)
				.name(request.name())
				.vehicleId(vehicle.id())
				.driverId(driver.id())
				.build();
		try {
			route = routeRepository.saveAndFlush(route);
		} catch (DataIntegrityViolationException e) {
			// Two requests claiming the same vehicle or driver at once: the unique constraints
			// are the backstop for the checks above.
			throw new RouteAssignmentConflictException("vehicleId", "Vehicle or driver is already on another route.");
		}
		return toResponse(schoolId, route, vehicle, driver);
	}

	@Transactional
	public RouteResponse editRoute(UUID schoolId, UUID routeId, RouteRequest request) {
		Route route = findOwned(schoolId, routeId);
		VehicleResponse vehicle = requireActiveVehicle(schoolId, request.vehicleId());
		DriverResponse driver = requireUsableDriver(schoolId, request.driverId());

		routeRepository.findBySchoolIdAndVehicleIdAndIdNot(schoolId, vehicle.id(), routeId)
				.ifPresent(taken -> {
					throw new RouteAssignmentConflictException("vehicleId",
							"Vehicle is already on route \"%s\".".formatted(taken.getName()));
				});
		routeRepository.findBySchoolIdAndDriverIdAndIdNot(schoolId, driver.id(), routeId)
				.ifPresent(taken -> {
					throw new RouteAssignmentConflictException("driverId",
							"Driver is already on route \"%s\".".formatted(taken.getName()));
				});

		route.setName(request.name());
		route.setVehicleId(vehicle.id());
		route.setDriverId(driver.id());
		try {
			routeRepository.saveAndFlush(route);
		} catch (DataIntegrityViolationException e) {
			throw new RouteAssignmentConflictException("vehicleId", "Vehicle or driver is already on another route.");
		}
		return toResponse(schoolId, route, vehicle, driver);
	}

	@Transactional
	public void deleteRoute(UUID schoolId, UUID routeId) {
		routeRepository.delete(findOwned(schoolId, routeId));
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

	private Route findOwned(UUID schoolId, UUID routeId) {
		return routeRepository.findBySchoolIdAndId(schoolId, routeId)
				.orElseThrow(() -> new RouteNotFoundException(NOT_FOUND_MESSAGE));
	}

	private RouteSummaryResponse summaryOf(Route route, VehicleResponse vehicle, DriverResponse driver) {
		int studentCount = 0;
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
				summary.studentCount(), summary.seatsLeft(), school, List.of());
	}
}
