package com.wassel.backend.attendance.controller;

import com.wassel.backend.attendance.dto.AttendancePageResponse;
import com.wassel.backend.attendance.dto.AttendanceRowResponse;
import com.wassel.backend.attendance.dto.AuditEntryResponse;
import com.wassel.backend.attendance.service.AttendanceService;
import com.wassel.backend.users.entity.User;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

/** The school's attendance rows and pickup/drop-off audit for the head of transportation. The school comes from the signed-in user. */
@RestController
@RequestMapping("/api/head-of-transport/attendance")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class HeadOfTransportAttendanceController {

	private final AttendanceService attendanceService;

	@GetMapping
	public AttendancePageResponse<AttendanceRowResponse> attendance(@AuthenticationPrincipal User head,
			HttpServletRequest request,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
			@RequestParam(required = false) UUID studentId, @RequestParam(required = false) UUID routeId,
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "" + AttendanceService.DEFAULT_SIZE) int size) {
		requireSingleValued(request);
		return attendanceService.attendance(schoolIdOf(head), from, to, studentId, routeId, page, size);
	}

	@GetMapping("/audit")
	public AttendancePageResponse<AuditEntryResponse> audit(@AuthenticationPrincipal User head,
			HttpServletRequest request,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
			@RequestParam(required = false) UUID studentId, @RequestParam(required = false) UUID routeId,
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "" + AttendanceService.DEFAULT_SIZE) int size) {
		requireSingleValued(request);
		return attendanceService.audit(schoolIdOf(head), from, to, studentId, routeId, page, size);
	}

	private static void requireSingleValued(HttpServletRequest request) {
		SingleValuedParameters.require(request, "from", "to", "studentId", "routeId", "page", "size");
	}

	private UUID schoolIdOf(User head) {
		if (head == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return head.getSchoolId();
	}
}
