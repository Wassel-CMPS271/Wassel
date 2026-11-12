package com.wassel.backend.runs.repository;

import com.wassel.backend.runs.entity.RunReassignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Every query is scoped by school id. */
public interface RunReassignmentRepository extends JpaRepository<RunReassignment, UUID> {

	/** Every change of the route's driver on that date, newest first. */
	List<RunReassignment> findBySchoolIdAndRouteIdAndRunDateOrderByChangedAtDescIdDesc(UUID schoolId, UUID routeId,
			LocalDate runDate);
}
