package com.wassel.backend.roster.controller;

import com.wassel.backend.roster.dto.StudentStatusRequest;
import com.wassel.backend.roster.service.RosterService;
import com.wassel.backend.routes.dto.BestRoutePlacementResponse;
import com.wassel.backend.routes.dto.BestRouteResponse;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Pausing, archiving and placing the students of the head of transportation's school. The school is always taken from
 * the authenticated principal, never from the request.
 */
@RestController
@RequestMapping("/api/head-of-transport/students/{id}")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class RosterController {

	private final RosterService rosterService;

	@PutMapping("/status")
	public StudentResponse changeStatus(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@Valid @RequestBody StudentStatusRequest request) {
		return rosterService.changeStatus(schoolIdOf(headOfTransport), id, request.status());
	}

	@GetMapping("/best-route")
	public BestRouteResponse bestRoutes(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return rosterService.bestRoutes(schoolIdOf(headOfTransport), id);
	}

	@PostMapping("/best-route")
	@ResponseStatus(HttpStatus.CREATED)
	public BestRoutePlacementResponse placeOnBestRoute(@AuthenticationPrincipal User headOfTransport,
			@PathVariable UUID id) {
		return rosterService.placeOnBestRoute(schoolIdOf(headOfTransport), id);
	}

	// Same principal assumption as StudentController.
	private static UUID schoolIdOf(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport.getSchoolId();
	}
}
