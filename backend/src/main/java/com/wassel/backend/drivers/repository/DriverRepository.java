package com.wassel.backend.drivers.repository;

import com.wassel.backend.drivers.entity.Driver;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every query is scoped by school id, so callers can't read or modify across the tenant
 * boundary.
 */
public interface DriverRepository extends JpaRepository<Driver, UUID> {

	List<Driver> findBySchoolIdOrderByInvitedAtAsc(UUID schoolId);

	Optional<Driver> findBySchoolIdAndId(UUID schoolId, UUID id);

	boolean existsBySchoolIdAndEmailIgnoreCase(UUID schoolId, String email);

	boolean existsBySchoolIdAndPhone(UUID schoolId, String phone);

	/** The other driver (if any) already assigned to this vehicle within the school. */
	Optional<Driver> findBySchoolIdAndAssignedVehicleIdAndIdNot(UUID schoolId, UUID assignedVehicleId,
			UUID excludedDriverId);
}
