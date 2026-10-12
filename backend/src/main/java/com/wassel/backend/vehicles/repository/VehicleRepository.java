package com.wassel.backend.vehicles.repository;

import com.wassel.backend.vehicles.entity.Vehicle;
import org.springframework.data.jpa.repository.JpaRepository;

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

	boolean existsBySchoolIdAndPlateNumber(UUID schoolId, String plateNumber);
}
