package com.wassel.backend.runs.controller;

import com.wassel.backend.runs.dto.ReassignRunRequest;
import com.wassel.backend.runs.dto.ReassignmentResponse;
import com.wassel.backend.runs.dto.RunResponse;
import com.wassel.backend.runs.dto.RunsDayResponse;
import com.wassel.backend.runs.service.RunService;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Every run of the head of transportation's school on a date, and reassigning a run's driver (SCRUM-264). The school
 * always comes from the authenticated principal, never from the request.
 */
@RestController
@RequestMapping("/api/head-of-transport/runs")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class HeadOfTransportRunController {

	private final RunService runService;

	@GetMapping
	public RunsDayResponse runs(@AuthenticationPrincipal User headOfTransport,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return runService.runsDay(signedIn(headOfTransport).getSchoolId(), date);
	}

	/** 201 when the route's driver changed, 200 when it already was the requested driver (nothing recorded). */
	@PostMapping("/{runId}/reassignments")
	public ResponseEntity<RunResponse> reassign(@AuthenticationPrincipal User headOfTransport,
			@PathVariable UUID runId, @Valid @RequestBody ReassignRunRequest request) {
		RunService.Reassigned result = runService.reassign(signedIn(headOfTransport), runId, request);
		return ResponseEntity.status(result.changed() ? 201 : 200).body(result.run());
	}

	@GetMapping("/{runId}/reassignments")
	public List<ReassignmentResponse> reassignments(@AuthenticationPrincipal User headOfTransport,
			@PathVariable UUID runId) {
		return runService.reassignments(signedIn(headOfTransport).getSchoolId(), runId);
	}

	private static User signedIn(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport;
	}
}
