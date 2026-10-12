package com.wassel.backend.vehicles.controller;

import com.wassel.backend.vehicles.dto.CreateVehicleRequest;
import com.wassel.backend.vehicles.dto.SetVehicleCapacityRequest;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.service.VehicleService;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
 * The school's fleet of vehicles for the head of transportation. The school is always taken
 * from the authenticated principal, never from the request, so a head of transportation can
 * only read and change their own school's fleet.
 */
@RestController
@RequestMapping("/api/head-of-transport/vehicles")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class VehicleController {

	private final VehicleService vehicleService;

	@GetMapping
	public List<VehicleResponse> listVehicles(@AuthenticationPrincipal User headOfTransport) {
		return vehicleService.listVehicles(schoolIdOf(headOfTransport));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public VehicleResponse addVehicle(@AuthenticationPrincipal User headOfTransport,
			@Valid @RequestBody CreateVehicleRequest request) {
		return vehicleService.addVehicle(schoolIdOf(headOfTransport), request);
	}

	@PatchMapping("/{id}/capacity")
	public VehicleResponse setCapacity(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@Valid @RequestBody SetVehicleCapacityRequest request) {
		return vehicleService.setCapacity(schoolIdOf(headOfTransport), id, request);
	}

	@PatchMapping("/{id}/deactivate")
	public VehicleResponse deactivate(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return vehicleService.deactivate(schoolIdOf(headOfTransport), id);
	}

	@PatchMapping("/{id}/reactivate")
	public VehicleResponse reactivate(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return vehicleService.reactivate(schoolIdOf(headOfTransport), id);
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
