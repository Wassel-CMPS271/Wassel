package com.wassel.backend.vehicles.repository;

import com.wassel.backend.vehicles.entity.Vehicle;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every query is scoped by school id, so callers can't read or modify across the tenant
 * boundary.
 */
public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {

	List<Vehicle> findBySchoolIdOrderByCreatedAtAsc(UUID schoolId);

	Optional<Vehicle> findBySchoolIdAndId(UUID schoolId, UUID id);

	/** The vehicle with its row locked until the transaction ends, for {@code VehicleService#setCapacity} (SCRUM-259). */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Vehicle> findLockedBySchoolIdAndId(UUID schoolId, UUID id);

	/**
	 * These vehicles with their rows locked until the transaction ends (SCRUM-259). Locked in id order, so two callers
	 * locking overlapping sets never wait for each other in a circle.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	List<Vehicle> findLockedBySchoolIdAndIdInOrderByIdAsc(UUID schoolId, Collection<UUID> ids);

	boolean existsBySchoolIdAndPlateNumber(UUID schoolId, String plateNumber);
}
