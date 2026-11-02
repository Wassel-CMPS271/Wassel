package com.wassel.backend.routes.service;

import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.vehicles.service.VehicleOccupancyGuard;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * The routes module's answer to the vehicles module's {@link VehicleOccupancyGuard} (SCRUM-241).
 * Its own class, not {@link RouteService}, so the two modules never need each other's beans — the
 * same reasoning {@code RunActiveRunGuard} documents for its own guard.
 */
@Component
@RequiredArgsConstructor
class RouteVehicleOccupancyGuard implements VehicleOccupancyGuard {

	private final RouteRepository routeRepository;

	private final StudentService studentService;

	@Override
	public long studentCountOnVehiclesRoute(UUID schoolId, UUID vehicleId) {
		return routeRepository.findLockedBySchoolIdAndVehicleId(schoolId, vehicleId)
				.map(Route::getId)
				.map(routeId -> studentService.countOnRoute(schoolId, routeId))
				.orElse(0L);
	}
}
