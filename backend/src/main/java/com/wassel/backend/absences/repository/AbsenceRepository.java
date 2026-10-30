package com.wassel.backend.absences.repository;

import com.wassel.backend.absences.entity.Absence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every query is scoped by school id, so callers can't read or modify across the tenant
 * boundary. Every query here also excludes cancelled rows: a cancelled absence is history (see
 * {@code Absence#cancelled}), not a live one, and must behave as "gone" everywhere it would
 * otherwise be read.
 */
public interface AbsenceRepository extends JpaRepository<Absence, UUID> {

	Optional<Absence> findBySchoolIdAndStudentIdAndIdAndCancelledFalse(UUID schoolId, UUID studentId, UUID id);

	/** A child's upcoming absences (contract: {@code toDate} today or later), earliest first. */
	List<Absence> findBySchoolIdAndStudentIdAndCancelledFalseAndToDateGreaterThanEqualOrderByFromDateAsc(
			UUID schoolId, UUID studentId, LocalDate today);

	/**
	 * This student's active absences that overlap the given range (inclusive on both ends), the
	 * application-level half of the overlap check — the database's exclusion constraint is the
	 * concurrency backstop for it, not a replacement for it: this is what lets
	 * {@code AbsenceService} tell an exact repeat (200, nothing new) from a genuine conflict (409)
	 * and name the absence it conflicts with. In a correctly maintained table this returns at
	 * most one row, since the constraint never lets two overlapping rows for one student exist.
	 */
	@Query("SELECT a FROM Absence a WHERE a.schoolId = :schoolId AND a.studentId = :studentId "
			+ "AND a.cancelled = false AND a.fromDate <= :toDate AND a.toDate >= :fromDate")
	List<Absence> findOverlapping(@Param("schoolId") UUID schoolId, @Param("studentId") UUID studentId,
			@Param("fromDate") LocalDate fromDate, @Param("toDate") LocalDate toDate);

	/** Every active absence in the school that covers this date, for the head of transportation's list. */
	@Query("SELECT a FROM Absence a WHERE a.schoolId = :schoolId AND a.cancelled = false "
			+ "AND a.fromDate <= :date AND a.toDate >= :date ORDER BY a.fromDate ASC")
	List<Absence> findActiveOn(@Param("schoolId") UUID schoolId, @Param("date") LocalDate date);
}
