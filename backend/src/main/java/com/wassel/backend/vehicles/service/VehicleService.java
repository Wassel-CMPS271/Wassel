package com.wassel.backend.vehicles.service;

import com.wassel.backend.vehicles.dto.CreateVehicleRequest;
import com.wassel.backend.vehicles.dto.SetVehicleCapacityRequest;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.entity.Vehicle;
import com.wassel.backend.vehicles.exception.VehicleAlreadyExistsException;
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

	@Transactional
	public VehicleResponse setCapacity(UUID schoolId, UUID vehicleId, SetVehicleCapacityRequest request) {
		Vehicle vehicle = findOwned(schoolId, vehicleId);
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

	private Vehicle findOwned(UUID schoolId, UUID vehicleId) {
		return vehicleRepository.findBySchoolIdAndId(schoolId, vehicleId)
				.orElseThrow(() -> new VehicleNotFoundException(NOT_FOUND_MESSAGE));
	}

	private VehicleResponse toResponse(Vehicle vehicle) {
		return new VehicleResponse(vehicle.getId(), vehicle.getPlateNumber(), vehicle.getCapacity(),
				vehicle.isActive(), vehicle.getCreatedAt());
	}
}
