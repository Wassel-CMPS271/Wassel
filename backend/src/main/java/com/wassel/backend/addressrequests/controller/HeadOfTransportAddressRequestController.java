package com.wassel.backend.addressrequests.controller;

import com.wassel.backend.addressrequests.dto.AddressRequestResponse;
import com.wassel.backend.addressrequests.dto.RejectAddressRequest;
import com.wassel.backend.addressrequests.entity.AddressRequestStatus;
import com.wassel.backend.addressrequests.exception.InvalidAddressRequestException;
import com.wassel.backend.addressrequests.service.AddressRequestService;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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

import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * The head of transportation's side of address requests: list the school's, approve, reject. The school is always
 * taken from the authenticated user, never from the request.
 */
@RestController
@RequestMapping("/api/head-of-transport/address-requests")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class HeadOfTransportAddressRequestController {

	private final AddressRequestService addressRequestService;

	@GetMapping
	public List<AddressRequestResponse> list(@AuthenticationPrincipal User headOfTransport,
			@RequestParam(defaultValue = "pending") String status) {
		return addressRequestService.list(schoolIdOf(headOfTransport), statusOf(status));
	}

	@PostMapping("/{id}/approve")
	public AddressRequestResponse approve(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return addressRequestService.approve(schoolIdOf(headOfTransport), id);
	}

	// The body is optional: rejecting without a reason sends none.
	@PostMapping("/{id}/reject")
	public AddressRequestResponse reject(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id,
			@Valid @RequestBody(required = false) RejectAddressRequest request) {
		return addressRequestService.reject(schoolIdOf(headOfTransport), id,
				request == null ? null : request.reason());
	}

	private static AddressRequestStatus statusOf(String status) {
		try {
			return AddressRequestStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
		} catch (IllegalArgumentException ex) {
			throw new InvalidAddressRequestException("status", "Status must be pending, approved or rejected");
		}
	}

	private static UUID schoolIdOf(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport.getSchoolId();
	}
}
