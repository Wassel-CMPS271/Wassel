package com.wassel.backend.drivers.controller;

import com.wassel.backend.drivers.dto.AssignVehicleRequest;
import com.wassel.backend.drivers.dto.CreateDriverRequest;
import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The school's driver roster for the head of transportation. The school is always taken from
 * the authenticated principal, never from the request, so a head of transportation can only
 * read and change their own school's drivers.
 */
@RestController
@RequestMapping("/api/head-of-transport/drivers")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class DriverController {

	private final DriverService driverService;

	@GetMapping
	public List<DriverResponse> listDrivers(@AuthenticationPrincipal User headOfTransport) {
		return driverService.listDrivers(schoolIdOf(headOfTransport));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public DriverResponse addDriver(@AuthenticationPrincipal User headOfTransport,
			@Valid @RequestBody CreateDriverRequest request) {
		return driverService.addDriver(schoolIdOf(headOfTransport), request);
	}

	@PatchMapping("/{id}/resend-invite")
	public DriverResponse resendInvite(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return driverService.resendInvite(schoolIdOf(headOfTransport), id);
	}

	@PatchMapping("/{id}/vehicle")
	public DriverResponse assignVehicle(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@Valid @RequestBody AssignVehicleRequest request) {
		return driverService.assignToVehicle(schoolIdOf(headOfTransport), id, request);
	}

	@DeleteMapping("/{id}/vehicle")
	public DriverResponse unassignVehicle(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return driverService.unassignFromVehicle(schoolIdOf(headOfTransport), id);
	}

	// Same principal assumption as SchoolSettingsController (see its SCRUM-168 TODO): change both
	// together if the JWT filter uses a different principal type.
	private UUID schoolIdOf(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport.getSchoolId();
	}
}
