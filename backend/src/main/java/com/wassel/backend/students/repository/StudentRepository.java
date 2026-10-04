package com.wassel.backend.students.repository;

import com.wassel.backend.students.entity.Student;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Every query is scoped by school id, so callers can't read or modify across the tenant
 * boundary.
 */
public interface StudentRepository extends JpaRepository<Student, UUID> {

	List<Student> findBySchoolIdOrderByCreatedAtAsc(UUID schoolId);

	boolean existsBySchoolIdAndFirstNameIgnoreCaseAndLastNameIgnoreCaseAndGuardianPhone(
			UUID schoolId, String firstName, String lastName, String guardianPhone);
}
