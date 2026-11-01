package com.wassel.backend.vehicles.service;

import com.wassel.backend.vehicles.dto.CreateVehicleRequest;
import com.wassel.backend.vehicles.dto.SetVehicleCapacityRequest;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.entity.Vehicle;
import com.wassel.backend.vehicles.exception.VehicleAlreadyExistsException;
import com.wassel.backend.vehicles.exception.VehicleCapacityConflictException;
import com.wassel.backend.vehicles.exception.VehicleNotFoundException;
import com.wassel.backend.vehicles.repository.VehicleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Manages a school's fleet of vehicles. Every method takes the school id explicitly and only
 * ever touches that school's vehicles, so callers can't cross the tenant boundary.
 */
@Service
@RequiredArgsConstructor
public class VehicleService {

	private static final String DUPLICATE_PLATE_MESSAGE = "A vehicle with that plate number already exists.";

	private static final String NOT_FOUND_MESSAGE = "Vehicle not found.";

	private final VehicleRepository vehicleRepository;

	private final VehicleOccupancyGuard occupancyGuard;

	/** The school's vehicles, oldest first. */
	@Transactional(readOnly = true)
	public List<VehicleResponse> listVehicles(UUID schoolId) {
		return vehicleRepository.findBySchoolIdOrderByCreatedAtAsc(schoolId).stream()
				.map(this::toResponse)
				.toList();
	}

	@Transactional
	public VehicleResponse addVehicle(UUID schoolId, CreateVehicleRequest request) {
		if (vehicleRepository.existsBySchoolIdAndPlateNumber(schoolId, request.plateNumber())) {
			throw new VehicleAlreadyExistsException(DUPLICATE_PLATE_MESSAGE);
		}

		Vehicle vehicle = Vehicle.builder()
				.schoolId(schoolId)
				.plateNumber(request.plateNumber())
				.capacity(request.capacity())
				.active(true)
				.build();
		try {
			return toResponse(vehicleRepository.saveAndFlush(vehicle));
		} catch (DataIntegrityViolationException e) {
			// Two requests adding the same plate at once: the unique constraint is the backstop
			// for the check above.
			throw new VehicleAlreadyExistsException(DUPLICATE_PLATE_MESSAGE);
		}
	}

	/**
	 * Lowering a vehicle's capacity below the number of students already on the route it is
	 * assigned to (SCRUM-241) is a 409: the route has no seats to lose. Equal to the current count
	 * is allowed (seats left reaches zero, never negative); a vehicle on no route can be set to
	 * any valid capacity.
	 */
	@Transactional
	public VehicleResponse setCapacity(UUID schoolId, UUID vehicleId, SetVehicleCapacityRequest request) {
		Vehicle vehicle = findOwned(schoolId, vehicleId);
		long currentCount = occupancyGuard.studentCountOnVehiclesRoute(schoolId, vehicleId);
		if (currentCount > request.capacity()) {
			throw new VehicleCapacityConflictException(
					"The route has %d students but this vehicle would seat %d.".formatted(currentCount, request.capacity()));
		}
		vehicle.setCapacity(request.capacity());
		return toResponse(vehicle);
	}

	@Transactional
	public VehicleResponse deactivate(UUID schoolId, UUID vehicleId) {
		Vehicle vehicle = findOwned(schoolId, vehicleId);
		vehicle.setActive(false);
		return toResponse(vehicle);
	}

	@Transactional
	public VehicleResponse reactivate(UUID schoolId, UUID vehicleId) {
		Vehicle vehicle = findOwned(schoolId, vehicleId);
		vehicle.setActive(true);
		return toResponse(vehicle);
	}

	/** For other modules (e.g. drivers, assigning a driver to a vehicle) to look up one vehicle. */
	@Transactional(readOnly = true)
	public VehicleResponse getOwnedVehicle(UUID schoolId, UUID vehicleId) {
		return toResponse(findOwned(schoolId, vehicleId));
	}

	private Vehicle findOwned(UUID schoolId, UUID vehicleId) {
		return vehicleRepository.findBySchoolIdAndId(schoolId, vehicleId)
				.orElseThrow(() -> new VehicleNotFoundException(NOT_FOUND_MESSAGE));
	}

	private VehicleResponse toResponse(Vehicle vehicle) {
		return new VehicleResponse(vehicle.getId(), vehicle.getPlateNumber(), vehicle.getCapacity(),
				vehicle.isActive(), vehicle.getCreatedAt());
	}
}
