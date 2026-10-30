package com.wassel.backend.absences.controller;

import com.wassel.backend.absences.dto.AbsentStudentResponse;
import com.wassel.backend.absences.service.AbsenceService;
import com.wassel.backend.users.entity.User;
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
import java.util.List;
import java.util.UUID;

/**
 * Who is absent on a given date (today, in the school's zone, when {@code date} is omitted), for
 * the head of transportation. The school is always taken from the authenticated user, never from
 * the request.
 */
@RestController
@RequestMapping("/api/head-of-transport/absences")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class HeadOfTransportAbsenceController {

	private final AbsenceService absenceService;

	@GetMapping
	public List<AbsentStudentResponse> listAbsencesOn(@AuthenticationPrincipal User headOfTransport,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return absenceService.listAbsencesOn(schoolIdOf(headOfTransport), date);
	}

	private UUID schoolIdOf(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport.getSchoolId();
	}
}
