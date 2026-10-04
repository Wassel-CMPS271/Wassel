package com.wassel.backend.students.service;

import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.exception.StudentAlreadyExistsException;
import com.wassel.backend.students.repository.StudentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Manages a school's student roster. Every method takes the school id explicitly and only ever
 * touches that school's students, so callers can't cross the tenant boundary.
 */
@Service
@RequiredArgsConstructor
public class StudentService {

	private static final String DUPLICATE_MESSAGE_FORMAT =
			"A student named %s %s with guardian phone %s already exists.";

	private final StudentRepository studentRepository;

	/** The school's students, oldest first. */
	@Transactional(readOnly = true)
	public List<StudentResponse> listStudents(UUID schoolId) {
		return studentRepository.findBySchoolIdOrderByCreatedAtAsc(schoolId).stream()
				.map(this::toResponse)
				.toList();
	}

	@Transactional
	public StudentResponse addStudent(UUID schoolId, CreateStudentRequest request) {
		if (studentRepository.existsBySchoolIdAndFirstNameIgnoreCaseAndLastNameIgnoreCaseAndGuardianPhone(
				schoolId, request.firstName(), request.lastName(), request.guardianPhone())) {
			throw new StudentAlreadyExistsException(DUPLICATE_MESSAGE_FORMAT
					.formatted(request.firstName(), request.lastName(), request.guardianPhone()));
		}

		Student student = Student.builder()
				.schoolId(schoolId)
				.firstName(request.firstName())
				.lastName(request.lastName())
				.grade(request.grade())
				.guardianName(request.guardianName())
				.guardianPhone(request.guardianPhone())
				.status(StudentStatus.ACTIVE)
				.build();
		return toResponse(studentRepository.saveAndFlush(student));
	}

	private StudentResponse toResponse(Student student) {
		return new StudentResponse(student.getId(), student.getFirstName(), student.getLastName(),
				student.getGrade(), student.getGuardianName(), student.getGuardianPhone(),
				student.getStatus().name().toLowerCase(), student.getCreatedAt());
	}
}
