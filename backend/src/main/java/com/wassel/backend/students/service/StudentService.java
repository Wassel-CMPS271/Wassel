package com.wassel.backend.students.service;

import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.LinkParentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.dto.UpdateStudentAddressRequest;
import com.wassel.backend.students.dto.UpdateStudentLocationRequest;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.exception.StudentAlreadyExistsException;
import com.wassel.backend.students.exception.StudentNotFoundException;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Manages a school's student roster. Every method takes the school id explicitly and only ever
 * touches that school's students, so callers can't cross the tenant boundary. Parent eligibility
 * for linking is checked through {@link UserService}, never by touching the users module's
 * repository or entity directly (beyond the {@code users.entity.User}/{@code Role} types every
 * module may reference).
 */
@Service
@RequiredArgsConstructor
public class StudentService {

	private static final String DUPLICATE_MESSAGE_FORMAT =
			"A student named %s %s with guardian phone %s already exists.";

	private static final String NOT_FOUND_MESSAGE = "Student not found.";

	private final StudentRepository studentRepository;

	private final UserService userService;

	/**
	 * The school's students, oldest first, optionally narrowed by a free-text query (matched
	 * against first name, last name, and guardian name), status, grade, and/or route. A blank or
	 * {@code "all"} value, or an unrecognized status, is treated as "no filter on that dimension",
	 * matching the leniency of the frontend's mock filters.
	 */
	@Transactional(readOnly = true)
	public List<StudentResponse> listStudents(UUID schoolId, String query, String status, String grade,
			String route) {
		return studentRepository
				.search(schoolId, parseStatus(status), normalize(grade), normalize(route), normalize(query))
				.stream()
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

	@Transactional
	public StudentResponse updateAddress(UUID schoolId, UUID studentId, UpdateStudentAddressRequest request) {
		Student student = findOwned(schoolId, studentId);
		student.setAddress(request.address());
		return toResponse(student);
	}

	@Transactional
	public StudentResponse updateLocation(UUID schoolId, UUID studentId, UpdateStudentLocationRequest request) {
		Student student = findOwned(schoolId, studentId);
		student.setLatitude(request.latitude());
		student.setLongitude(request.longitude());
		return toResponse(student);
	}

	@Transactional
	public StudentResponse linkParent(UUID schoolId, UUID studentId, LinkParentRequest request) {
		Student student = findOwned(schoolId, studentId);
		// Throws UserNotFoundException (mapped 404) if no such parent exists in this school.
		userService.getOwnedUser(schoolId, request.parentUserId(), Role.PARENT);
		student.setParentUserId(request.parentUserId());
		return toResponse(student);
	}

	private StudentStatus parseStatus(String status) {
		String normalized = normalize(status);
		if (normalized == null) {
			return null;
		}
		try {
			return StudentStatus.valueOf(normalized.toUpperCase());
		} catch (IllegalArgumentException e) {
			return null;
		}
	}

	private String normalize(String value) {
		if (value == null) {
			return null;
		}
		String trimmed = value.trim();
		return (trimmed.isEmpty() || trimmed.equalsIgnoreCase("all")) ? null : trimmed;
	}

	private Student findOwned(UUID schoolId, UUID studentId) {
		return studentRepository.findBySchoolIdAndId(schoolId, studentId)
				.orElseThrow(() -> new StudentNotFoundException(NOT_FOUND_MESSAGE));
	}

	private StudentResponse toResponse(Student student) {
		return new StudentResponse(student.getId(), student.getFirstName(), student.getLastName(),
				student.getGrade(), student.getGuardianName(), student.getGuardianPhone(),
				student.getStatus().name().toLowerCase(), student.getAddress(), student.getLatitude(),
				student.getLongitude(), student.getRoute(), student.getParentUserId(), student.getCreatedAt());
	}
}
