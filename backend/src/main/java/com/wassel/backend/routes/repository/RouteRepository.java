package com.wassel.backend.routes.repository;

import com.wassel.backend.routes.entity.Route;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

	/** The route's driver as stored now. A scalar read, so it is never a stale cached entity (SCRUM-264). */
	@Query("select r.driverId from Route r where r.schoolId = :schoolId and r.id = :id")
	Optional<UUID> findDriverIdBySchoolIdAndId(@Param("schoolId") UUID schoolId, @Param("id") UUID id);

	/**
	 * Gives the route to this driver in one statement (SCRUM-264). Unlike changing the loaded entity and flushing, a
	 * refusal by the unique key is the only statement that runs: Hibernate repeats a failed entity update once more,
	 * and the repeat is logged as "current transaction is aborted" next to the real error. The loaded entity is not
	 * refreshed, so callers must not read the driver from it afterwards.
	 */
	@Modifying
	@Query("update Route r set r.driverId = :driverId where r.schoolId = :schoolId and r.id = :id")
	int updateDriverId(@Param("schoolId") UUID schoolId, @Param("id") UUID id, @Param("driverId") UUID driverId);

	/** The route (if any) already using this vehicle within the school. For create, where there's no route to exclude yet. */
	Optional<Route> findBySchoolIdAndVehicleId(UUID schoolId, UUID vehicleId);

	/** The route (if any) already using this driver within the school. For create, where there's no route to exclude yet. */
	Optional<Route> findBySchoolIdAndDriverId(UUID schoolId, UUID driverId);

	/** The other route (if any) already using this vehicle within the school, for edit. */
	Optional<Route> findBySchoolIdAndVehicleIdAndIdNot(UUID schoolId, UUID vehicleId, UUID excludedRouteId);

	/** The other route (if any) already using this driver within the school, for edit. */
	Optional<Route> findBySchoolIdAndDriverIdAndIdNot(UUID schoolId, UUID driverId, UUID excludedRouteId);
}
