package com.wassel.backend.students.repository;

import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every query is scoped by school id, so callers can't read or modify across the tenant
 * boundary.
 */
public interface StudentRepository extends JpaRepository<Student, UUID> {

	List<Student> findBySchoolIdOrderByCreatedAtAsc(UUID schoolId);

	Optional<Student> findBySchoolIdAndId(UUID schoolId, UUID id);

	boolean existsBySchoolIdAndFirstNameIgnoreCaseAndLastNameIgnoreCaseAndGuardianPhone(
			UUID schoolId, String firstName, String lastName, String guardianPhone);

	// Each filter is skipped when its parameter is null; "query" matches firstName, lastName, or
	// guardianName case-insensitively (SCRUM-167).
	@Query("""
			SELECT s FROM Student s
			WHERE s.schoolId = :schoolId
			AND (:status IS NULL OR s.status = :status)
			AND (:grade IS NULL OR s.grade = :grade)
			AND (:route IS NULL OR s.route = :route)
			AND (:query IS NULL
				OR LOWER(s.firstName) LIKE LOWER(CONCAT('%', :query, '%'))
				OR LOWER(s.lastName) LIKE LOWER(CONCAT('%', :query, '%'))
				OR LOWER(s.guardianName) LIKE LOWER(CONCAT('%', :query, '%')))
			ORDER BY s.createdAt ASC
			""")
	List<Student> search(@Param("schoolId") UUID schoolId, @Param("status") StudentStatus status,
			@Param("grade") String grade, @Param("route") String route, @Param("query") String query);
}
