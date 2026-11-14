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
	 * Saves the status for the student on the run, or leaves the row that is there, and returns 1 when it saved one (0 for a retry). One statement, so a retry
	 * keeps the first time; catching the unique-key violation instead would poison the surrounding PostgreSQL
	 * transaction. Callers have already checked the run and the student belong to the school.
	 */
	@Modifying
	@Query(value = """
			INSERT INTO run_confirmations (id, school_id, run_id, student_id, status, confirmed_at)
			VALUES (gen_random_uuid(), :schoolId, :runId, :studentId, :status, :now)
			ON CONFLICT (run_id, student_id, status) DO NOTHING
			""", nativeQuery = true)
	int insertIfMissing(@Param("schoolId") UUID schoolId, @Param("runId") UUID runId,
			@Param("studentId") UUID studentId, @Param("status") String status, @Param("now") Instant now);

	/**
	 * For the transport totals (SCRUM-271): per date in the range, how many distinct students were picked up (their
	 * latest status on a run that day is PICKED_UP or DROPPED_OFF), dropped off, and left not present (latest
	 * status NOT_PRESENT). The latest status is the highest, as everywhere ({@code ConfirmationStatus} is declared in
	 * rank order). Rows are {@code [runDate, pickedUp, droppedOff, notPresent]}; a date with no confirmation has no row.
	 */
	@Query(value = """
			SELECT x.run_date,
				COUNT(DISTINCT x.student_id) FILTER (WHERE x.rank >= 1),
				COUNT(DISTINCT x.student_id) FILTER (WHERE x.rank = 2),
				COUNT(DISTINCT x.student_id) FILTER (WHERE x.rank = 0)
			FROM (
				SELECT r.run_date, c.run_id, c.student_id,
					MAX(CASE c.status WHEN 'NOT_PRESENT' THEN 0 WHEN 'PICKED_UP' THEN 1 ELSE 2 END) AS rank
				FROM run_confirmations c JOIN runs r ON r.id = c.run_id
				WHERE r.school_id = :schoolId AND c.school_id = :schoolId AND r.run_date BETWEEN :from AND :to
				GROUP BY r.run_date, c.run_id, c.student_id) x
			GROUP BY x.run_date
			""", nativeQuery = true)
	List<Object[]> riderCountsByDate(@Param("schoolId") UUID schoolId, @Param("from") LocalDate from,
			@Param("to") LocalDate to);

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
}
