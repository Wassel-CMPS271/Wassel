package com.wassel.backend.attendance.controller;

import com.wassel.backend.attendance.dto.ChildAttendanceResponse;
import com.wassel.backend.attendance.service.AttendanceService;
import com.wassel.backend.users.entity.User;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A parent's attendance history for one of their own children. The school and the parent come from the signed-in
 * user; {@link AttendanceService} checks {@code studentId} against that parent before reading anything.
 */
@RestController
@RequestMapping("/api/parent/children/{studentId}/attendance")
@PreAuthorize("hasRole('PARENT')")
@RequiredArgsConstructor
public class ParentAttendanceController {

	private final AttendanceService attendanceService;

	@GetMapping
	public List<ChildAttendanceResponse> history(@AuthenticationPrincipal User parent, @PathVariable UUID studentId,
			HttpServletRequest request,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		if (parent == null) {
			throw new AccessDeniedException("No authenticated parent");
		}
		SingleValuedParameters.require(request, "from", "to");
		return attendanceService.childHistory(parent.getSchoolId(), parent.getId(), studentId, from, to);
	}
}
