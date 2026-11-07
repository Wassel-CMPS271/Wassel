package com.wassel.backend.routes.repository;

import com.wassel.backend.routes.entity.Route;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every query is scoped by school id, so callers can't read or modify across the tenant
 * boundary.
 */
public interface RouteRepository extends JpaRepository<Route, UUID> {

	List<Route> findBySchoolIdOrderByCreatedAtAsc(UUID schoolId);

	Optional<Route> findBySchoolIdAndId(UUID schoolId, UUID id);

	/**
	 * The route with its row locked until the transaction ends (SCRUM-259). Every change that can
	 * leave a route with more students than seats takes it before its capacity check: adding a
	 * student, swapping the vehicle, lowering the vehicle's seats.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Route> findLockedBySchoolIdAndId(UUID schoolId, UUID id);

	/**
	 * The route on this vehicle, with its row locked until the transaction ends (SCRUM-259). A
	 * route that moves off the vehicle while this waits for the lock is not returned.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Route> findLockedBySchoolIdAndVehicleId(UUID schoolId, UUID vehicleId);

	/** All of the school's routes, their rows locked until the transaction ends, in id order (SCRUM-259). */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	List<Route> findLockedBySchoolIdOrderByIdAsc(UUID schoolId);

	/** The route (if any) already using this vehicle within the school. For create, where there's no route to exclude yet. */
	Optional<Route> findBySchoolIdAndVehicleId(UUID schoolId, UUID vehicleId);

	/** The route (if any) already using this driver within the school. For create, where there's no route to exclude yet. */
	Optional<Route> findBySchoolIdAndDriverId(UUID schoolId, UUID driverId);

	/** The other route (if any) already using this vehicle within the school, for edit. */
	Optional<Route> findBySchoolIdAndVehicleIdAndIdNot(UUID schoolId, UUID vehicleId, UUID excludedRouteId);

	/** The other route (if any) already using this driver within the school, for edit. */
	Optional<Route> findBySchoolIdAndDriverIdAndIdNot(UUID schoolId, UUID driverId, UUID excludedRouteId);
}
