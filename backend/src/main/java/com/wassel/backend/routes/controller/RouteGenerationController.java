package com.wassel.backend.routes.controller;

import com.wassel.backend.routes.dto.FleetProposalResponse;
import com.wassel.backend.routes.dto.RouteSummaryResponse;
import com.wassel.backend.routes.service.RouteGenerationService;
import com.wassel.backend.users.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Generate, apply and discard a proposal for all of the school's routes (SCRUM-207). The school is
 * always taken from the authenticated principal, never from the request.
 */
@RestController
@RequestMapping("/api/head-of-transport/routes/generation")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class RouteGenerationController {

	private final RouteGenerationService generationService;

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public FleetProposalResponse generate(@AuthenticationPrincipal User headOfTransport) {
		return generationService.generate(schoolIdOf(headOfTransport));
	}

	@PostMapping("/{proposalId}/apply")
	public List<RouteSummaryResponse> apply(@AuthenticationPrincipal User headOfTransport,
			@PathVariable UUID proposalId) {
		return generationService.apply(schoolIdOf(headOfTransport), proposalId);
	}

	@DeleteMapping("/{proposalId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void discard(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID proposalId) {
		generationService.discard(schoolIdOf(headOfTransport), proposalId);
	}

	private UUID schoolIdOf(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport.getSchoolId();
	}
}
