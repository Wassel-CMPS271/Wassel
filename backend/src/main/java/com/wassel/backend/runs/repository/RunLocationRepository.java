package com.wassel.backend.runs.repository;

import com.wassel.backend.runs.entity.RunLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every statement is scoped by school id. Writes are single conditional statements, not read-then-write, so a late
 * position cannot bring back a withdrawn one; each clears the persistence context so a re-read is not a stale entity.
 */
public interface RunLocationRepository extends JpaRepository<RunLocation, UUID> {

	List<RunLocation> findBySchoolIdAndRunIdIn(UUID schoolId, Collection<UUID> runIds);

	Optional<RunLocation> findBySchoolIdAndRunId(UUID schoolId, UUID runId);

	/**
	 * The opt-in: the only statement that creates the row. A fresh opt-in, after a withdrawal or by another driver,
	 * starts with no position; a repeat by the driver already sharing changes nothing, so a retry keeps the position.
	 */
	@Modifying(clearAutomatically = true)
	@Query(value = """
			INSERT INTO run_locations (run_id, school_id, driver_id, sharing)
			VALUES (:runId, :schoolId, :driverId, true)
			ON CONFLICT (run_id) DO UPDATE SET driver_id = :driverId, sharing = true, latitude = NULL,
				longitude = NULL, accuracy_meters = NULL, received_at = NULL
			WHERE NOT (run_locations.sharing AND run_locations.driver_id = EXCLUDED.driver_id)
			""", nativeQuery = true)
	void startSharing(@Param("schoolId") UUID schoolId, @Param("runId") UUID runId, @Param("driverId") UUID driverId);

	/** The withdrawal, and the end of the run: sharing off and the position emptied. Changes nothing if there is no row. */
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE run_locations SET sharing = false, latitude = NULL, longitude = NULL, accuracy_meters = NULL,
				received_at = NULL
			WHERE run_id = :runId AND school_id = :schoolId
			""", nativeQuery = true)
	void stopSharing(@Param("schoolId") UUID schoolId, @Param("runId") UUID runId);

	/** Stores the position and returns 1, or returns 0 when this driver is not sharing this run (never inserts). */
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE run_locations SET latitude = :latitude, longitude = :longitude, accuracy_meters = :accuracy,
				received_at = :now
			WHERE run_id = :runId AND school_id = :schoolId AND sharing AND driver_id = :driverId
			""", nativeQuery = true)
	int savePosition(@Param("schoolId") UUID schoolId, @Param("runId") UUID runId, @Param("driverId") UUID driverId,
			@Param("latitude") double latitude, @Param("longitude") double longitude,
			@Param("accuracy") double accuracy, @Param("now") Instant now);

	/** Empties every position received before the cutoff, in every school: the retention clean-up. */
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE run_locations SET latitude = NULL, longitude = NULL, accuracy_meters = NULL, received_at = NULL
			WHERE received_at < :cutoff
			""", nativeQuery = true)
	int clearReceivedBefore(@Param("cutoff") Instant cutoff);
}
