package com.wassel.backend.routes.repository;

import com.wassel.backend.routes.entity.Route;
import org.springframework.data.jpa.repository.JpaRepository;

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

	/** The route (if any) already using this vehicle within the school. For create, where there's no route to exclude yet. */
	Optional<Route> findBySchoolIdAndVehicleId(UUID schoolId, UUID vehicleId);

	/** The route (if any) already using this driver within the school. For create, where there's no route to exclude yet. */
	Optional<Route> findBySchoolIdAndDriverId(UUID schoolId, UUID driverId);

	/** The other route (if any) already using this vehicle within the school, for edit. */
	Optional<Route> findBySchoolIdAndVehicleIdAndIdNot(UUID schoolId, UUID vehicleId, UUID excludedRouteId);

	/** The other route (if any) already using this driver within the school, for edit. */
	Optional<Route> findBySchoolIdAndDriverIdAndIdNot(UUID schoolId, UUID driverId, UUID excludedRouteId);
}
