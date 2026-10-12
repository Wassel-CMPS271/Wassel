package com.wassel.backend.schools.repository;

import com.wassel.backend.schools.entity.HalfDay;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Every query is scoped by school id, so callers can't read across the tenant boundary.
 */
public interface HalfDayRepository extends JpaRepository<HalfDay, UUID> {

	List<HalfDay> findBySchoolIdOrderByDateAsc(UUID schoolId);

	boolean existsBySchoolIdAndDate(UUID schoolId, LocalDate date);
}
