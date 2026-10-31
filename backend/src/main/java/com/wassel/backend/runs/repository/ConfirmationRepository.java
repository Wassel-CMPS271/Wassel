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
}
