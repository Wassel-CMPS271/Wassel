package com.wassel.backend.runs.repository;

import com.wassel.backend.runs.entity.Run;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Every read is scoped by school id, so callers can't read across the tenant boundary.
 * {@code createMissing} trusts its caller to pass a route of that school.
 */
public interface RunRepository extends JpaRepository<Run, UUID> {

	List<Run> findBySchoolIdAndRunDateAndRouteIdIn(UUID schoolId, LocalDate runDate, Collection<UUID> routeIds);

	/**
	 * Creates the route's morning and afternoon run for the date, leaving any that exist. One statement, so
	 * two requests racing for the same run both succeed and one wins: catching the unique-key violation
	 * instead would poison the surrounding PostgreSQL transaction. The casts give the parameters a type in a
	 * select list. Call it before anything loads runs in the same transaction, so no stale entity is read.
	 */
	@Modifying
	@Query(value = """
			INSERT INTO runs (id, school_id, route_id, run_date, direction, state)
			SELECT gen_random_uuid(), CAST(:schoolId AS uuid), CAST(:routeId AS uuid), CAST(:date AS date),
				d.direction, 'NOT_STARTED'
			FROM (VALUES ('MORNING'), ('AFTERNOON')) AS d(direction)
			ON CONFLICT (route_id, run_date, direction) DO NOTHING
			""", nativeQuery = true)
	void createMissing(@Param("schoolId") UUID schoolId, @Param("routeId") UUID routeId,
			@Param("date") LocalDate date);
}
