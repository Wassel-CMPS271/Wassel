package com.wassel.backend.drivers.service;

import com.wassel.backend.drivers.dto.AssignVehicleRequest;
import com.wassel.backend.drivers.dto.CreateDriverRequest;
import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.exception.DriverAlreadyExistsException;
import com.wassel.backend.drivers.exception.DriverNotFoundException;
import com.wassel.backend.drivers.exception.DriverStatusConflictException;
import com.wassel.backend.drivers.exception.VehicleAssignmentConflictException;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.service.VehicleService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Manages a school's driver roster: inviting drivers and assigning them to vehicles. Every
 * method takes the school id explicitly and only ever touches that school's drivers, so callers
 * can't cross the tenant boundary. Vehicle eligibility is checked through {@link VehicleService},
 * never by touching the vehicles module's repository or entity directly.
 */
@Service
@RequiredArgsConstructor
public class DriverService {

	private static final String EMAIL_TAKEN_MESSAGE = "A driver with that email already exists.";

	private static final String PHONE_TAKEN_MESSAGE = "A driver with that phone number already exists.";

	private static final String NOT_FOUND_MESSAGE = "Driver not found.";

	private static final String VEHICLE_DEACTIVATED_MESSAGE = "Cannot assign a driver to a deactivated vehicle.";

	private final DriverRepository driverRepository;

	private final VehicleService vehicleService;

	/** The school's drivers, in invite order. */
	@Transactional(readOnly = true)
	public List<DriverResponse> listDrivers(UUID schoolId) {
		return driverRepository.findBySchoolIdOrderByInvitedAtAsc(schoolId).stream()
				.map(this::toResponse)
				.toList();
	}

	@Transactional
	public DriverResponse addDriver(UUID schoolId, CreateDriverRequest request) {
		if (driverRepository.existsBySchoolIdAndEmailIgnoreCase(schoolId, request.email())) {
			throw new DriverAlreadyExistsException("email", EMAIL_TAKEN_MESSAGE);
		}
		if (driverRepository.existsBySchoolIdAndPhone(schoolId, request.phone())) {
			throw new DriverAlreadyExistsException("phone", PHONE_TAKEN_MESSAGE);
		}

		Driver driver = Driver.builder()
				.schoolId(schoolId)
				.firstName(request.firstName())
				.lastName(request.lastName())
				.phone(request.phone())
				.email(request.email())
				.status(DriverStatus.INVITED)
				.invitedAt(Instant.now())
				.build();
		try {
			return toResponse(driverRepository.saveAndFlush(driver));
		} catch (DataIntegrityViolationException e) {
			// Two requests adding the same email/phone at once: the unique constraints are the
			// backstop for the checks above.
			throw new DriverAlreadyExistsException("email", EMAIL_TAKEN_MESSAGE);
		}
	}

	@Transactional
	public DriverResponse resendInvite(UUID schoolId, UUID driverId) {
		Driver driver = findOwned(schoolId, driverId);
		if (driver.getStatus() != DriverStatus.INVITED) {
			throw new DriverStatusConflictException(
					"Cannot resend invite: driver is already %s.".formatted(statusLabel(driver)));
		}
		driver.setInvitedAt(Instant.now());
		return toResponse(driver);
	}

	@Transactional
	public DriverResponse assignToVehicle(UUID schoolId, UUID driverId, AssignVehicleRequest request) {
		Driver driver = findOwned(schoolId, driverId);
		if (driver.getStatus() == DriverStatus.DEACTIVATED) {
			throw new DriverStatusConflictException("Cannot assign a deactivated driver to a vehicle.");
		}

		// Throws VehicleNotFoundException (already mapped by the global exception handler) if the
		// vehicle doesn't exist or belongs to a different school.
		VehicleResponse vehicle = vehicleService.getOwnedVehicle(schoolId, request.vehicleId());
		if (!vehicle.isActive()) {
			throw new VehicleAssignmentConflictException(VEHICLE_DEACTIVATED_MESSAGE);
		}

		driverRepository.findBySchoolIdAndAssignedVehicleIdAndIdNot(schoolId, request.vehicleId(), driverId)
				.ifPresent(takenBy -> {
					throw new VehicleAssignmentConflictException("Vehicle is already assigned to %s %s."
							.formatted(takenBy.getFirstName(), takenBy.getLastName()));
				});

		driver.setAssignedVehicleId(request.vehicleId());
		try {
			driverRepository.saveAndFlush(driver);
		} catch (DataIntegrityViolationException e) {
			// Two drivers assigned to the same vehicle at once: the unique constraint is the
			// backstop for the check above.
			throw new VehicleAssignmentConflictException("Vehicle is already assigned to another driver.");
		}
		return toResponse(driver);
	}

	@Transactional
	public DriverResponse unassignFromVehicle(UUID schoolId, UUID driverId) {
		Driver driver = findOwned(schoolId, driverId);
		driver.setAssignedVehicleId(null);
		return toResponse(driver);
	}

	private Driver findOwned(UUID schoolId, UUID driverId) {
		return driverRepository.findBySchoolIdAndId(schoolId, driverId)
				.orElseThrow(() -> new DriverNotFoundException(NOT_FOUND_MESSAGE));
	}

	private String statusLabel(Driver driver) {
		return driver.getStatus().name().toLowerCase();
	}

	private DriverResponse toResponse(Driver driver) {
		return new DriverResponse(driver.getId(), driver.getFirstName(), driver.getLastName(),
				driver.getPhone(), driver.getEmail(), statusLabel(driver), driver.getInvitedAt(),
				driver.getAssignedVehicleId());
	}
}
