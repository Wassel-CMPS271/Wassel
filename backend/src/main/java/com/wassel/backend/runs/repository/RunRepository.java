package com.wassel.backend.runs.repository;

import com.wassel.backend.runs.entity.Run;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every read and update is scoped by school id, so callers can't cross the tenant boundary.
 * {@code createMissing} trusts its caller to pass a route of that school.
 */
public interface RunRepository extends JpaRepository<Run, UUID> {

	List<Run> findBySchoolIdAndRunDateAndRouteIdIn(UUID schoolId, LocalDate runDate, Collection<UUID> routeIds);

	/**
	 * The run with its row locked until the transaction ends. A confirmation takes it so that its checks (the run is
	 * in progress, what the student already has) and its insert are not interleaved with another confirmation of
	 * the same student or with the run ending. The first row lock in the codebase; it is held for milliseconds.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Run> findLockedBySchoolIdAndId(UUID schoolId, UUID id);

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

	/**
	 * Moves a run from {@code NOT_STARTED} to {@code IN_PROGRESS} and saves the time, or changes nothing. A
	 * conditional update, not read-then-write, so two simultaneous starts leave the first time in place. The
	 * caller re-reads the run to tell a move from a repeat or a conflict, so the update clears the persistence
	 * context: that re-read must not be a stale cached entity.
	 */
	@Modifying(clearAutomatically = true)
	@Query("""
			update Run r set r.state = com.wassel.backend.runs.entity.RunState.IN_PROGRESS, r.startedAt = :now
			where r.id = :id and r.schoolId = :schoolId
				and r.state = com.wassel.backend.runs.entity.RunState.NOT_STARTED
			""")
	void markStarted(@Param("schoolId") UUID schoolId, @Param("id") UUID id, @Param("now") Instant now);

	/** As {@link #markStarted}, from {@code IN_PROGRESS} to {@code FINISHED}. */
	@Modifying(clearAutomatically = true)
	@Query("""
			update Run r set r.state = com.wassel.backend.runs.entity.RunState.FINISHED, r.endedAt = :now
			where r.id = :id and r.schoolId = :schoolId
				and r.state = com.wassel.backend.runs.entity.RunState.IN_PROGRESS
			""")
	void markEnded(@Param("schoolId") UUID schoolId, @Param("id") UUID id, @Param("now") Instant now);
}
