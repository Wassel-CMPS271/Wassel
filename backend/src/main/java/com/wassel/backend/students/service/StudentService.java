package com.wassel.backend.students.service;

import com.wassel.backend.geocoding.service.GeocodeResult;
import com.wassel.backend.geocoding.service.Geocoder;
import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.LinkParentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.dto.UpdateStudentAddressRequest;
import com.wassel.backend.students.dto.UpdateStudentLocationRequest;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.exception.InvalidStopOrderException;
import com.wassel.backend.students.exception.StudentAlreadyExistsException;
import com.wassel.backend.students.exception.StudentNotActiveException;
import com.wassel.backend.students.exception.StudentNotFoundException;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

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

	private static final String NOT_ACTIVE_MESSAGE = "Only active students can be added to a route.";

	private static final String NOT_ON_ROUTE_MESSAGE = "Student is not on this route.";

	private static final String DUPLICATE_STOP_MESSAGE = "A student appears more than once in the new order.";

	private static final String STOPS_DONT_MATCH_MESSAGE =
			"The new order must contain exactly the route's current stops.";

	private final StudentRepository studentRepository;

	private final UserService userService;

	private final Geocoder geocoder;

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

	/**
	 * An address is optional (SCRUM-213); when given, it's geocoded the same as a later address
	 * change (SCRUM-211) — a brand-new student has no pin yet, so there's nothing manually placed
	 * to protect, unlike {@link #updateAddress}.
	 */
	@Transactional
	public StudentResponse addStudent(UUID schoolId, CreateStudentRequest request) {
		if (studentRepository.existsBySchoolIdAndFirstNameIgnoreCaseAndLastNameIgnoreCaseAndGuardianPhone(
				schoolId, request.firstName(), request.lastName(), request.guardianPhone())) {
			throw new StudentAlreadyExistsException(DUPLICATE_MESSAGE_FORMAT
					.formatted(request.firstName(), request.lastName(), request.guardianPhone()));
		}

		Student.StudentBuilder student = Student.builder()
				.schoolId(schoolId)
				.firstName(request.firstName())
				.lastName(request.lastName())
				.grade(request.grade())
				.guardianName(request.guardianName())
				.guardianPhone(request.guardianPhone())
				.status(StudentStatus.ACTIVE)
				.address(request.address());
		if (request.address() != null) {
			Optional<GeocodeResult> result = geocoder.geocode(request.address());
			student.latitude(result.map(GeocodeResult::latitude).orElse(null));
			student.longitude(result.map(GeocodeResult::longitude).orElse(null));
		}
		return toResponse(studentRepository.saveAndFlush(student.build()));
	}

	/**
	 * Saving a new address re-geocodes it (SCRUM-211), unless {@code manualPin} is set: a pin
	 * placed by hand is never overwritten by a lookup, no matter how the address changes. A
	 * failed or empty lookup clears any previous (non-manual) pin — it belonged to the old
	 * address, not this one — leaving the student needing a manual pin, the same meaning
	 * {@code latitude: null} already has everywhere else.
	 */
	@Transactional
	public StudentResponse updateAddress(UUID schoolId, UUID studentId, UpdateStudentAddressRequest request) {
		Student student = findOwned(schoolId, studentId);
		student.setAddress(request.address());
		if (!student.isManualPin()) {
			Optional<GeocodeResult> result = geocoder.geocode(request.address());
			student.setLatitude(result.map(GeocodeResult::latitude).orElse(null));
			student.setLongitude(result.map(GeocodeResult::longitude).orElse(null));
		}
		return toResponse(student);
	}

	@Transactional
	public StudentResponse updateLocation(UUID schoolId, UUID studentId, UpdateStudentLocationRequest request) {
		Student student = findOwned(schoolId, studentId);
		student.setLatitude(request.latitude());
		student.setLongitude(request.longitude());
		student.setManualPin(true);
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

	/**
	 * Puts an active student on a route, as its new last stop. A student already on a different
	 * route is moved: this just overwrites {@code routeId}/{@code stopPosition} on the student's
	 * own row, so the old route's count drops without anything else to clean up. Takes a plain
	 * route id, the same way {@code route} on this entity is a plain string: this module never
	 * imports the routes module.
	 */
	@Transactional
	public void assignToRoute(UUID schoolId, UUID studentId, UUID routeId) {
		Student student = findOwned(schoolId, studentId);
		if (student.getStatus() != StudentStatus.ACTIVE) {
			throw new StudentNotActiveException(NOT_ACTIVE_MESSAGE);
		}
		Integer maxPosition = studentRepository.findMaxStopPosition(schoolId, routeId);
		student.setRouteId(routeId);
		student.setStopPosition((maxPosition == null ? 0 : maxPosition) + 1);
	}

	/** Throws if the student isn't currently a stop on this particular route. */
	@Transactional
	public void removeFromRoute(UUID schoolId, UUID studentId, UUID routeId) {
		Student student = findOwned(schoolId, studentId);
		if (!routeId.equals(student.getRouteId())) {
			throw new StudentNotFoundException(NOT_ON_ROUTE_MESSAGE);
		}
		student.setRouteId(null);
		student.setStopPosition(null);
	}

	/** For the routes module to compute {@code studentCount}/{@code seatsLeft}. */
	@Transactional(readOnly = true)
	public long countOnRoute(UUID schoolId, UUID routeId) {
		return studentRepository.countBySchoolIdAndRouteId(schoolId, routeId);
	}

	/**
	 * Whether this student is already a stop on this exact route, so the routes module can skip
	 * the capacity check for them: re-adding them takes no new seat, since they're already
	 * counted in {@link #countOnRoute}.
	 */
	@Transactional(readOnly = true)
	public boolean isOnRoute(UUID schoolId, UUID studentId, UUID routeId) {
		return studentRepository.existsBySchoolIdAndIdAndRouteId(schoolId, studentId, routeId);
	}

	/**
	 * Releases every student on this route: for when the route itself is deleted, so nobody is
	 * left pointing at a route id that no longer exists.
	 */
	@Transactional
	public void clearRoute(UUID schoolId, UUID routeId) {
		studentRepository.findBySchoolIdAndRouteIdOrderByStopPositionAsc(schoolId, routeId)
				.forEach(student -> {
					student.setRouteId(null);
					student.setStopPosition(null);
				});
	}

	/**
	 * Replaces the route's whole stop order. {@code studentIds} must contain exactly the route's
	 * current stops, no more, no fewer, none repeated — this moves nobody on or off the route,
	 * it only reorders. Positions are rewritten as a clean 1..n (unlike {@link #assignToRoute}'s
	 * watermark), since the whole order is being replaced at once.
	 */
	@Transactional
	public void reorderRoute(UUID schoolId, UUID routeId, List<UUID> studentIds) {
		List<Student> currentStops = studentRepository.findBySchoolIdAndRouteIdOrderByStopPositionAsc(schoolId, routeId);
		Set<UUID> currentIds = currentStops.stream().map(Student::getId).collect(Collectors.toSet());
		Set<UUID> givenIds = new HashSet<>(studentIds);

		if (givenIds.size() != studentIds.size()) {
			throw new InvalidStopOrderException(DUPLICATE_STOP_MESSAGE);
		}
		if (!givenIds.equals(currentIds)) {
			throw new InvalidStopOrderException(STOPS_DONT_MATCH_MESSAGE);
		}

		Map<UUID, Student> byId = currentStops.stream().collect(Collectors.toMap(Student::getId, student -> student));
		for (int i = 0; i < studentIds.size(); i++) {
			byId.get(studentIds.get(i)).setStopPosition(i + 1);
		}
	}

	/** The route's stops, in position order, for the routes module to build its {@code Stop} shape. */
	@Transactional(readOnly = true)
	public List<StudentResponse> listOnRoute(UUID schoolId, UUID routeId) {
		return studentRepository.findBySchoolIdAndRouteIdOrderByStopPositionAsc(schoolId, routeId).stream()
				.map(this::toResponse)
				.toList();
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
