package com.wassel.backend.absences.service;

import com.wassel.backend.absences.dto.AbsenceResponse;
import com.wassel.backend.absences.dto.AbsentStudentResponse;
import com.wassel.backend.absences.dto.AbsentStudentRouteResponse;
import com.wassel.backend.absences.dto.ReportAbsenceRequest;
import com.wassel.backend.absences.entity.Absence;
import com.wassel.backend.absences.exception.AbsenceNotCancellableException;
import com.wassel.backend.absences.exception.AbsenceNotFoundException;
import com.wassel.backend.absences.exception.AbsenceOverlapException;
import com.wassel.backend.absences.exception.InvalidAbsenceDateException;
import com.wassel.backend.absences.repository.AbsenceRepository;
import com.wassel.backend.routes.dto.StudentRouteResponse;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.exception.StudentNotFoundException;
import com.wassel.backend.students.service.StudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Manages a child's absences (SCRUM-238). Every method takes the school id explicitly and only
 * ever touches that school's rows; a studentId is always checked against the signed-in parent
 * through {@link StudentService#findChildOf} first, so a parent can only read or change their
 * own children's absences. Reaches {@code students} and {@code routes} only through their
 * service layer, never their repositories or entities.
 *
 * <p>The overlap rule (contract: an exact repeat of an existing absence is idempotent; any other
 * overlap is a 409) is checked here, in the application, for the error message the contract
 * wants ("names the absence it overlaps") and the 200-vs-201 decision. The database's exclusion
 * constraint ({@code V6__absences.sql}) is the race-condition backstop: it is what actually
 * guarantees no two overlapping, non-cancelled absences ever exist for one student, across
 * however many app instances are running, the same way a unique constraint backs the holiday and
 * route checks. The check below can still race (read, then a concurrent insert wins before this
 * one writes); PostgreSQL aborts the whole transaction once a statement fails (see
 * {@code RouteService#lostRace}), so the losing request in {@link #reportAbsence} must not query
 * again in the same transaction — it answers a plain 409 asking the client to retry, the same
 * race-loss pattern {@code RouteService#propose} uses for two optimizations of a route at once.
 */
@Service
@RequiredArgsConstructor
public class AbsenceService {

	private static final String CHILD_NOT_FOUND_MESSAGE = "Child not found.";

	private static final String ABSENCE_NOT_FOUND_MESSAGE = "Absence not found.";

	private final AbsenceRepository absenceRepository;

	private final StudentService studentService;

	private final RouteService routeService;

	private final Clock clock;

	/** A child's upcoming absences (contract: {@code toDate} today or later), earliest first. */
	@Transactional(readOnly = true)
	public List<AbsenceResponse> listUpcoming(UUID schoolId, UUID parentUserId, UUID studentId) {
		requireChild(schoolId, parentUserId, studentId);
		LocalDate today = LocalDate.now(clock);
		return absenceRepository
				.findBySchoolIdAndStudentIdAndCancelledFalseAndToDateGreaterThanEqualOrderByFromDateAsc(
						schoolId, studentId, today)
				.stream()
				.map(this::toResponse)
				.toList();
	}

	/**
	 * Reports an absence. {@code toDate} defaults to {@code fromDate}. An exact repeat of an
	 * absence this child already has is idempotent: nothing is written, and the existing one
	 * comes back with {@link ReportResult#created} false (200). Any other overlap is rejected
	 * (409). {@code fromDate} must be today or later and {@code toDate} not before
	 * {@code fromDate} (400).
	 */
	@Transactional
	public ReportResult reportAbsence(UUID schoolId, UUID parentUserId, UUID studentId, ReportAbsenceRequest request) {
		requireChild(schoolId, parentUserId, studentId);
		LocalDate fromDate = request.fromDate();
		LocalDate toDate = request.toDate() == null ? fromDate : request.toDate();
		LocalDate today = LocalDate.now(clock);
		if (fromDate.isBefore(today)) {
			throw new InvalidAbsenceDateException("fromDate", "Absences can only be reported for today or later.");
		}
		if (toDate.isBefore(fromDate)) {
			throw new InvalidAbsenceDateException("toDate", "The last day can't be before the first day.");
		}

		Optional<ReportResult> existing = resolveOverlap(schoolId, studentId, fromDate, toDate);
		if (existing.isPresent()) {
			return existing.get();
		}

		Absence absence = Absence.builder().schoolId(schoolId).studentId(studentId).fromDate(fromDate).toDate(toDate)
				.createdBy(parentUserId).build();
		try {
			return new ReportResult(toResponse(absenceRepository.saveAndFlush(absence)), true);
		} catch (DataIntegrityViolationException e) {
			// Lost the race: another request for an overlapping range committed first, and the
			// exclusion constraint is what caught it, not the check above. PostgreSQL has already
			// aborted this transaction, so nothing here may query before this is thrown (same
			// constraint RouteService#lostRace documents) — the client's retry runs in a fresh
			// transaction and will resolve correctly (200 for an exact repeat, 409 naming the
			// real conflict otherwise).
			throw new AbsenceOverlapException(
					"Another absence for overlapping dates was just reported for this child. Try again.");
		}
	}

	/**
	 * Cancels an absence (contract): one that hasn't started yet ({@code fromDate} today or
	 * later) is marked cancelled, which behaves as deleted everywhere (see {@code
	 * Absence#cancelled}); one already in progress ({@code fromDate} before today, {@code toDate}
	 * today or later) is shortened to end yesterday, so the days already gone by stay recorded.
	 * One that already fully ended is 409.
	 */
	@Transactional
	public void cancelAbsence(UUID schoolId, UUID parentUserId, UUID studentId, UUID absenceId) {
		requireChild(schoolId, parentUserId, studentId);
		Absence absence = absenceRepository.findBySchoolIdAndStudentIdAndIdAndCancelledFalse(schoolId, studentId, absenceId)
				.orElseThrow(() -> new AbsenceNotFoundException(ABSENCE_NOT_FOUND_MESSAGE));
		LocalDate today = LocalDate.now(clock);
		if (absence.getToDate().isBefore(today)) {
			throw new AbsenceNotCancellableException(
					"This absence ended on %s and can no longer be cancelled.".formatted(absence.getToDate()));
		}
		if (absence.getFromDate().isBefore(today)) {
			absence.setToDate(today.minusDays(1));
		} else {
			absence.setCancelled(true);
		}
	}

	/** Every active absence in the school on {@code date} (today when null), for the head of transportation. */
	@Transactional(readOnly = true)
	public List<AbsentStudentResponse> listAbsencesOn(UUID schoolId, LocalDate date) {
		LocalDate target = date == null ? LocalDate.now(clock) : date;
		return absenceRepository.findActiveOn(schoolId, target).stream()
				.map(absence -> toAbsentStudentResponse(schoolId, absence))
				.toList();
	}

	/**
	 * The child, only if it's this parent's own; otherwise the same 404 a studentId that doesn't
	 * exist at all would get, so a parent can't tell "not yours" from "unknown" apart.
	 */
	private void requireChild(UUID schoolId, UUID parentUserId, UUID studentId) {
		studentService.findChildOf(schoolId, parentUserId, studentId)
				.orElseThrow(() -> new StudentNotFoundException(CHILD_NOT_FOUND_MESSAGE));
	}

	/**
	 * Compares the given range against this child's existing active absences: present with
	 * {@code created} false when it's an exact repeat of one of them, empty when there's no
	 * overlap at all (the caller should insert), and throws {@link AbsenceOverlapException} for
	 * any other overlap. In a correctly maintained table at most one existing absence can
	 * overlap, since the database never lets two stand for the same student.
	 */
	private Optional<ReportResult> resolveOverlap(UUID schoolId, UUID studentId, LocalDate fromDate, LocalDate toDate) {
		List<Absence> overlapping = absenceRepository.findOverlapping(schoolId, studentId, fromDate, toDate);
		for (Absence other : overlapping) {
			if (other.getFromDate().equals(fromDate) && other.getToDate().equals(toDate)) {
				return Optional.of(new ReportResult(toResponse(other), false));
			}
			throw new AbsenceOverlapException("Overlaps an absence already reported from %s to %s."
					.formatted(other.getFromDate(), other.getToDate()));
		}
		return Optional.empty();
	}

	private AbsentStudentResponse toAbsentStudentResponse(UUID schoolId, Absence absence) {
		StudentResponse student = studentService.getStudent(schoolId, absence.getStudentId());
		Optional<StudentRouteResponse> routeInfo = routeService.findStudentRoute(schoolId, absence.getStudentId());
		AbsentStudentRouteResponse route = routeInfo
				.map(info -> new AbsentStudentRouteResponse(info.routeId(), info.routeName()))
				.orElse(null);
		Integer position = routeInfo.map(StudentRouteResponse::position).orElse(null);
		return new AbsentStudentResponse(absence.getId(), student.id(), student.firstName(), student.lastName(),
				absence.getFromDate(), absence.getToDate(), route, position);
	}

	private AbsenceResponse toResponse(Absence absence) {
		return new AbsenceResponse(absence.getId(), absence.getStudentId(), absence.getFromDate(), absence.getToDate());
	}

	/** Whether {@link #reportAbsence} wrote a new row (201) or returned an existing exact repeat (200). */
	public record ReportResult(AbsenceResponse absence, boolean created) {
	}
}
