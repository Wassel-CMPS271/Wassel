package com.wassel.backend.addressrequests.controller;

import com.wassel.backend.addressrequests.dto.AddressRequestResponse;
import com.wassel.backend.addressrequests.dto.SubmitAddressRequest;
import com.wassel.backend.addressrequests.service.AddressRequestService;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * A parent's address-change requests for their own children. The school and the parent are always taken from the
 * authenticated user, never from the request; {@link AddressRequestService} still checks {@code studentId} against
 * that parent on every call.
 */
@RestController
@RequestMapping("/api/parent/children/{studentId}/address-requests")
@PreAuthorize("hasRole('PARENT')")
@RequiredArgsConstructor
public class ParentAddressRequestController {

	private final AddressRequestService addressRequestService;

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public AddressRequestResponse submit(@AuthenticationPrincipal User parent, @PathVariable UUID studentId,
			@Valid @RequestBody SubmitAddressRequest request) {
		signedIn(parent);
		return addressRequestService.submit(parent.getSchoolId(), parent.getId(), parent.getEmail(), studentId,
				request);
	}

	@GetMapping
	public List<AddressRequestResponse> list(@AuthenticationPrincipal User parent, @PathVariable UUID studentId) {
		signedIn(parent);
		return addressRequestService.listForChild(parent.getSchoolId(), parent.getId(), studentId);
	}

	// Same principal assumption as SchoolSettingsController (see its SCRUM-168 TODO): change
	// every controller together if the JWT filter ever uses a different principal type.
	private static void signedIn(User parent) {
		if (parent == null) {
			throw new AccessDeniedException("No authenticated parent");
		}
	}
}
