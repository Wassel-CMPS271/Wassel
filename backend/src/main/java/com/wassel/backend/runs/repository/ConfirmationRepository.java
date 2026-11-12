package com.wassel.backend.runs.repository;

import com.wassel.backend.runs.entity.Confirmation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Every read is scoped by school id, so callers can't cross the tenant boundary. */
public interface ConfirmationRepository extends JpaRepository<Confirmation, UUID> {

	List<Confirmation> findBySchoolIdAndRunIdIn(UUID schoolId, Collection<UUID> runIds);

	List<Confirmation> findBySchoolIdAndRunIdAndStudentId(UUID schoolId, UUID runId, UUID studentId);

	/**
	 * Saves the status for the student on the run, or leaves the row that is there. One statement, so a retry
	 * keeps the first time; catching the unique-key violation instead would poison the surrounding PostgreSQL
	 * transaction. Callers have already checked the run and the student belong to the school.
	 */
	@Modifying
	@Query(value = """
			INSERT INTO run_confirmations (id, school_id, run_id, student_id, status, confirmed_at)
			VALUES (gen_random_uuid(), :schoolId, :runId, :studentId, :status, :now)
			ON CONFLICT (run_id, student_id, status) DO NOTHING
			""", nativeQuery = true)
	void insertIfMissing(@Param("schoolId") UUID schoolId, @Param("runId") UUID runId,
			@Param("studentId") UUID studentId, @Param("status") String status, @Param("now") Instant now);

	/** The student's confirmations on the school's runs of that date that are in progress, with each run's route. */
	@Query("""
			select new com.wassel.backend.runs.repository.ConfirmationOnRun(r.routeId, c.status, c.confirmedAt)
			from Confirmation c, Run r
			where c.runId = r.id and c.schoolId = :schoolId and r.schoolId = :schoolId
				and c.studentId = :studentId and r.runDate = :date
				and r.state = com.wassel.backend.runs.entity.RunState.IN_PROGRESS
			""")
	List<ConfirmationOnRun> findOnRunsInProgress(@Param("schoolId") UUID schoolId, @Param("studentId") UUID studentId,
			@Param("date") LocalDate date);

	/**
	 * The shared FROM and WHERE of the attendance and audit queries (SCRUM-265), so a page query and its count cannot
	 * drift apart. Both the run and the confirmation must be in the school. A null {@code studentId} or {@code routeId}
	 * means no filter; the casts give a null a type, which PostgreSQL cannot infer.
	 */
	String RECORDED_IN_RANGE = """
			FROM run_confirmations c JOIN runs r ON r.id = c.run_id
			WHERE r.school_id = :schoolId AND c.school_id = :schoolId AND r.run_date BETWEEN :from AND :to
				AND (CAST(:studentId AS uuid) IS NULL OR c.student_id = CAST(:studentId AS uuid))
				AND (CAST(:routeId AS uuid) IS NULL OR r.route_id = CAST(:routeId AS uuid))
			""";

	/**
	 * For the attendance history (SCRUM-265): one row per student and run in the date range, with the time of each
	 * status or null, newest date first. Columns: run id, route id, run date, direction, student id, then the three
	 * times. Filters on the run's date, never on when it was recorded.
	 */
	@Query(value = """
			SELECT r.id, r.route_id, r.run_date, r.direction, c.student_id,
				MAX(c.confirmed_at) FILTER (WHERE c.status = 'NOT_PRESENT'),
				MAX(c.confirmed_at) FILTER (WHERE c.status = 'PICKED_UP'),
				MAX(c.confirmed_at) FILTER (WHERE c.status = 'DROPPED_OFF')
			""" + RECORDED_IN_RANGE + """
			GROUP BY r.id, r.route_id, r.run_date, r.direction, c.student_id
			ORDER BY r.run_date DESC, CASE r.direction WHEN 'AFTERNOON' THEN 0 ELSE 1 END, r.route_id, c.student_id
			LIMIT :limit OFFSET :offset
			""", nativeQuery = true)
	List<Object[]> attendanceRows(@Param("schoolId") UUID schoolId, @Param("from") LocalDate from,
			@Param("to") LocalDate to, @Param("studentId") UUID studentId, @Param("routeId") UUID routeId,
			@Param("limit") long limit, @Param("offset") long offset);

	/** How many rows {@link #attendanceRows} has in all, same filters. */
	@Query(value = "SELECT COUNT(*) FROM (SELECT 1 " + RECORDED_IN_RANGE + " GROUP BY r.id, c.student_id) AS grouped",
			nativeQuery = true)
	long countAttendanceRows(@Param("schoolId") UUID schoolId, @Param("from") LocalDate from,
			@Param("to") LocalDate to, @Param("studentId") UUID studentId, @Param("routeId") UUID routeId);

	/**
	 * For the audit (SCRUM-265): one row per stored confirmation in the range, newest first, a tie broken by the higher
	 * status and then the higher id so a page never repeats or skips a row. Columns: id, time, status, run id, route
	 * id, run date, direction, student id. Filters as {@link #attendanceRows}.
	 */
	@Query(value = """
			SELECT c.id, c.confirmed_at, c.status, r.id, r.route_id, r.run_date, r.direction, c.student_id
			""" + RECORDED_IN_RANGE + """
			ORDER BY c.confirmed_at DESC,
				CASE c.status WHEN 'NOT_PRESENT' THEN 0 WHEN 'PICKED_UP' THEN 1 ELSE 2 END DESC, c.id DESC
			LIMIT :limit OFFSET :offset
			""", nativeQuery = true)
	List<Object[]> auditRows(@Param("schoolId") UUID schoolId, @Param("from") LocalDate from,
			@Param("to") LocalDate to, @Param("studentId") UUID studentId, @Param("routeId") UUID routeId,
			@Param("limit") long limit, @Param("offset") long offset);

	/** How many rows {@link #auditRows} has in all, same filters. */
	@Query(value = "SELECT COUNT(*) " + RECORDED_IN_RANGE, nativeQuery = true)
	long countAuditRows(@Param("schoolId") UUID schoolId, @Param("from") LocalDate from, @Param("to") LocalDate to,
			@Param("studentId") UUID studentId, @Param("routeId") UUID routeId);
}
