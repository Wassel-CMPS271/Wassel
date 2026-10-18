package com.wassel.backend.routes.controller;

import com.wassel.backend.routes.dto.AssignStudentRequest;
import com.wassel.backend.routes.dto.ProposalResponse;
import com.wassel.backend.routes.dto.ReorderStopsRequest;
import com.wassel.backend.routes.dto.RouteRequest;
import com.wassel.backend.routes.dto.RouteResponse;
import com.wassel.backend.routes.dto.RouteSummaryResponse;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The school's routes for the head of transportation. The school is always taken from the
 * authenticated principal, never from the request, so a head of transportation can only read
 * and change their own school's routes.
 */
@RestController
@RequestMapping("/api/head-of-transport/routes")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class RouteController {

	private final RouteService routeService;

	@GetMapping
	public List<RouteSummaryResponse> listRoutes(@AuthenticationPrincipal User headOfTransport) {
		return routeService.listRoutes(schoolIdOf(headOfTransport));
	}

	@GetMapping("/{id}")
	public RouteResponse getRoute(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return routeService.getRoute(schoolIdOf(headOfTransport), id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public RouteResponse createRoute(@AuthenticationPrincipal User headOfTransport,
			@Valid @RequestBody RouteRequest request) {
		return routeService.createRoute(schoolIdOf(headOfTransport), request);
	}

	@PutMapping("/{id}")
	public RouteResponse editRoute(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@Valid @RequestBody RouteRequest request) {
		return routeService.editRoute(schoolIdOf(headOfTransport), id, request);
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteRoute(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		routeService.deleteRoute(schoolIdOf(headOfTransport), id);
	}

	@PostMapping("/{id}/students")
	public RouteResponse addStudent(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@Valid @RequestBody AssignStudentRequest request) {
		return routeService.addStudent(schoolIdOf(headOfTransport), id, request);
	}

	@DeleteMapping("/{id}/students/{studentId}")
	public RouteResponse removeStudent(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@PathVariable UUID studentId) {
		return routeService.removeStudent(schoolIdOf(headOfTransport), id, studentId);
	}

	@PutMapping("/{id}/stops")
	public RouteResponse reorderStops(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@Valid @RequestBody ReorderStopsRequest request) {
		return routeService.reorderStops(schoolIdOf(headOfTransport), id, request);
	}

	@PostMapping("/{id}/optimization")
	@ResponseStatus(HttpStatus.CREATED)
	public ProposalResponse propose(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return routeService.propose(schoolIdOf(headOfTransport), id);
	}

	@PostMapping("/{id}/optimization/{proposalId}/apply")
	public RouteResponse applyProposal(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@PathVariable UUID proposalId) {
		return routeService.applyProposal(schoolIdOf(headOfTransport), id, proposalId);
	}

	@DeleteMapping("/{id}/optimization/{proposalId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void discardProposal(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@PathVariable UUID proposalId) {
		routeService.discardProposal(schoolIdOf(headOfTransport), id, proposalId);
	}

	private UUID schoolIdOf(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport.getSchoolId();
	}
}
