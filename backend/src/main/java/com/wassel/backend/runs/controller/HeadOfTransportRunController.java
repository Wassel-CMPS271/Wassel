package com.wassel.backend.runs.controller;

import com.wassel.backend.runs.dto.RunLocationResponse;
import com.wassel.backend.runs.dto.RunsDayResponse;
import com.wassel.backend.runs.service.RunService;
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

/**
 * Every run of the head of transportation's school on a date. The school always comes from the
 * authenticated principal, never from the request.
 */
@RestController
@RequestMapping("/api/head-of-transport/runs")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class HeadOfTransportRunController {

	private final RunService runService;

	@GetMapping("/locations")
	public List<RunLocationResponse> locations(@AuthenticationPrincipal User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return runService.locationsToday(headOfTransport.getSchoolId());
	}

	@GetMapping
	public RunsDayResponse runs(@AuthenticationPrincipal User headOfTransport,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return runService.runsDay(headOfTransport.getSchoolId(), date);
	}
}
