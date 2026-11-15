package com.wassel.backend.attendance.service;

import com.wassel.backend.attendance.dto.AttendancePageResponse;
import com.wassel.backend.attendance.dto.AttendanceRouteResponse;
import com.wassel.backend.attendance.dto.AttendanceRowResponse;
import com.wassel.backend.attendance.dto.AttendanceStudentResponse;
import com.wassel.backend.attendance.dto.AuditEntryResponse;
import com.wassel.backend.attendance.dto.ChildAttendanceResponse;
import com.wassel.backend.attendance.exception.InvalidAttendanceQueryException;
import com.wassel.backend.routes.exception.RouteNotFoundException;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.runs.dto.RecordPage;
import com.wassel.backend.runs.dto.RecordedOnRun;
import com.wassel.backend.runs.service.RunService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.exception.StudentNotFoundException;
import com.wassel.backend.students.service.StudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Attendance history and the pickup/drop-off audit (SCRUM-265, docs/contracts/attendance.md). Never writes. A parent's
 * request is checked against their own children before anything is read; the head of transportation's filters are
 * checked against the school, so another school's id is a 404, never an empty list. Names are looked up once per page.
 */
@Service
@RequiredArgsConstructor
public class AttendanceService {

	static final int MAX_DAYS = 62;

	public static final int DEFAULT_SIZE = 50;

	static final int MAX_SIZE = 200;

	private static final String CHILD_NOT_FOUND = "Child not found.";

	private final RunService runService;

	private final StudentService studentService;

	private final RouteService routeService;

	/** The child's history, newest first. The range is checked first, so a bad request is a 400 for every caller. */
	public List<ChildAttendanceResponse> childHistory(UUID schoolId, UUID parentId, UUID studentId, LocalDate from,
			LocalDate to) {
		validateRange(from, to);
		studentService.findChildOf(schoolId, parentId, studentId)
				.orElseThrow(() -> new StudentNotFoundException(CHILD_NOT_FOUND));
		return runService.attendanceOf(schoolId, from, to, studentId).stream().map(ChildAttendanceResponse::from)
				.toList();
	}

	public AttendancePageResponse<AttendanceRowResponse> attendance(UUID schoolId, LocalDate from, LocalDate to,
			UUID studentId, UUID routeId, int page, int size) {
		validate(from, to, page, size);
		checkFilters(schoolId, studentId, routeId);
		return pageOf(schoolId, from, to, page, size,
				runService.attendance(schoolId, from, to, studentId, routeId, (long) page * size, size),
				AttendanceRowResponse::from);
	}

	public AttendancePageResponse<AuditEntryResponse> audit(UUID schoolId, LocalDate from, LocalDate to,
			UUID studentId, UUID routeId, int page, int size) {
		validate(from, to, page, size);
		checkFilters(schoolId, studentId, routeId);
		return pageOf(schoolId, from, to, page, size,
				runService.audit(schoolId, from, to, studentId, routeId, (long) page * size, size),
				AuditEntryResponse::from);
	}

	private void validate(LocalDate from, LocalDate to, int page, int size) {
		validateRange(from, to);
		if (page < 0) {
			throw new InvalidAttendanceQueryException("page", "Page must not be negative");
		}
		if (size < 1 || size > MAX_SIZE) {
			throw new InvalidAttendanceQueryException("size", "Size must be between 1 and " + MAX_SIZE);
		}
	}

	private void validateRange(LocalDate from, LocalDate to) {
		if (to.isBefore(from)) {
			throw new InvalidAttendanceQueryException("to", "To must not be before from");
		}
		if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_DAYS) {
			throw new InvalidAttendanceQueryException("to", "The range may cover at most " + MAX_DAYS + " days");
		}
	}

	private void checkFilters(UUID schoolId, UUID studentId, UUID routeId) {
		if (studentId != null) {
			studentService.getStudent(schoolId, studentId);
		}
		if (routeId != null && routeService.findRouteNames(schoolId, List.of(routeId)).isEmpty()) {
			throw new RouteNotFoundException("Route not found.");
		}
	}

	/** Names the students and routes of a page (one read each) and builds its items. */
	private <R extends RecordedOnRun, T> AttendancePageResponse<T> pageOf(UUID schoolId, LocalDate from, LocalDate to,
			int page, int size, RecordPage<R> found, Assemble<R, T> assemble) {
		Set<UUID> studentIds = found.items().stream().map(RecordedOnRun::studentId).collect(Collectors.toSet());
		Set<UUID> routeIds = found.items().stream().map(RecordedOnRun::routeId).collect(Collectors.toSet());
		Names names = new Names(studentService.findStudents(schoolId, studentIds),
				routeService.findRouteNames(schoolId, routeIds));
		List<T> items = found.items().stream()
				.map(r -> assemble.of(r, names.route(r), names.student(r)))
				.toList();
		return new AttendancePageResponse<>(from, to, page, size, found.total(), items);
	}

	/** How one record and its names make an item of a page. */
	@FunctionalInterface
	private interface Assemble<R, T> {

		T of(R record, AttendanceRouteResponse route, AttendanceStudentResponse student);
	}

	private record Names(Map<UUID, StudentResponse> students, Map<UUID, String> routes) {

		/** A confirmation whose student is gone is a fault, not a row to skip: the audit must not lose one silently. */
		AttendanceStudentResponse student(RecordedOnRun record) {
			StudentResponse found = students.get(record.studentId());
			if (found == null) {
				throw new IllegalStateException(
						"Confirmation for unknown student " + record.studentId() + " on run " + record.runId());
			}
			return new AttendanceStudentResponse(found.id(), found.firstName(), found.lastName());
		}

		/** The name is null for a deleted route. */
		AttendanceRouteResponse route(RecordedOnRun record) {
			return new AttendanceRouteResponse(record.routeId(), routes.get(record.routeId()));
		}
	}
}
