package com.wassel.backend.runs.controller;

import com.wassel.backend.runs.dto.ConfirmationRequest;
import com.wassel.backend.runs.dto.LocationRequest;
import com.wassel.backend.runs.dto.SharingRequest;
import com.wassel.backend.runs.dto.RunResponse;
import com.wassel.backend.runs.dto.RunsDayResponse;
import com.wassel.backend.runs.service.RunService;
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
 * The signed-in driver's runs. The driver and the school always come from the authenticated principal,
 * never from the request, so a driver can only ever read their own route's runs.
 */
@RestController
@RequestMapping("/api/driver/runs")
@PreAuthorize("hasRole('DRIVER')")
@RequiredArgsConstructor
public class DriverRunController {

	private final RunService runService;

	@GetMapping("/today")
	public RunsDayResponse today(@AuthenticationPrincipal User driver) {
		return runService.driverDay(signedIn(driver));
	}

	@PostMapping("/{runId}/start")
	public RunResponse start(@AuthenticationPrincipal User driver, @PathVariable UUID runId) {
		return runService.start(signedIn(driver), runId);
	}

	@PostMapping("/{runId}/end")
	public RunResponse end(@AuthenticationPrincipal User driver, @PathVariable UUID runId) {
		return runService.end(signedIn(driver), runId);
	}

	@PutMapping("/{runId}/students/{studentId}/confirmation")
	public RunResponse confirm(@AuthenticationPrincipal User driver, @PathVariable UUID runId,
			@PathVariable UUID studentId, @Valid @RequestBody ConfirmationRequest request) {
		return runService.confirm(signedIn(driver), runId, studentId, request.status());
	}

	@PutMapping("/{runId}/location-sharing")
	public RunResponse setSharing(@AuthenticationPrincipal User driver, @PathVariable UUID runId,
			@Valid @RequestBody SharingRequest request) {
		return runService.setSharing(signedIn(driver), runId, request.enabled());
	}

	@PutMapping("/{runId}/location")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void recordLocation(@AuthenticationPrincipal User driver, @PathVariable UUID runId,
			@Valid @RequestBody LocationRequest request) {
		runService.recordLocation(signedIn(driver), runId, request);
	}

	private static User signedIn(User driver) {
		if (driver == null) {
			throw new AccessDeniedException("No authenticated driver");
		}
		return driver;
	}
}
