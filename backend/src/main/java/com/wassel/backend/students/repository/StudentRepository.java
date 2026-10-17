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

	long countBySchoolIdAndRouteId(UUID schoolId, UUID routeId);

	boolean existsBySchoolIdAndIdAndRouteId(UUID schoolId, UUID id, UUID routeId);

	List<Student> findBySchoolIdAndRouteIdOrderByStopPositionAsc(UUID schoolId, UUID routeId);

	/** Null when the route has no stops yet. The next stop's position is this plus one. */
	@Query("SELECT MAX(s.stopPosition) FROM Student s WHERE s.schoolId = :schoolId AND s.routeId = :routeId")
	Integer findMaxStopPosition(@Param("schoolId") UUID schoolId, @Param("routeId") UUID routeId);

	// Each filter is skipped when its parameter is null; "query" matches firstName, lastName, or
	// guardianName case-insensitively (SCRUM-167).
	// :query is CAST to string everywhere it appears: unlike :status/:grade/:route, which are
	// compared directly against a typed entity attribute and so get their type from there, :query
	// only ever appears inside CONCAT(...)/LOWER(...), which gives Hibernate no typed attribute to
	// infer from. A null :query then goes to PostgreSQL untyped, and the PG JDBC driver guesses
	// bytea, so LOWER(bytea) fails with "function lower(bytea) does not exist" (H2 doesn't care,
	// so this only shows up against Postgres). The CAST forces the string type regardless of value.
	@Query("""
			SELECT s FROM Student s
			WHERE s.schoolId = :schoolId
			AND (:status IS NULL OR s.status = :status)
			AND (:grade IS NULL OR s.grade = :grade)
			AND (:route IS NULL OR s.route = :route)
			AND (CAST(:query AS string) IS NULL
				OR LOWER(s.firstName) LIKE LOWER(CONCAT('%', CAST(:query AS string), '%'))
				OR LOWER(s.lastName) LIKE LOWER(CONCAT('%', CAST(:query AS string), '%'))
				OR LOWER(s.guardianName) LIKE LOWER(CONCAT('%', CAST(:query AS string), '%')))
			ORDER BY s.createdAt ASC
			""")
	List<Student> search(@Param("schoolId") UUID schoolId, @Param("status") StudentStatus status,
			@Param("grade") String grade, @Param("route") String route, @Param("query") String query);
}
