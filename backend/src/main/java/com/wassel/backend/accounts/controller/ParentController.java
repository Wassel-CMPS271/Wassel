package com.wassel.backend.accounts.controller;

import com.wassel.backend.accounts.dto.AccountResponse;
import com.wassel.backend.accounts.dto.CreateAccountRequest;
import com.wassel.backend.accounts.service.AccountService;
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

/** The head of transportation invites, lists, revokes and restores their own school's parents. */
@RestController
@RequestMapping("/api/head-of-transport/parents")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class ParentController {

	private final AccountService accountService;

	@GetMapping
	public List<AccountResponse> listParents(@AuthenticationPrincipal User headOfTransport) {
		return accountService.listParents(schoolIdOf(headOfTransport));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public AccountResponse inviteParent(@AuthenticationPrincipal User headOfTransport,
			@Valid @RequestBody CreateAccountRequest request) {
		return accountService.createParent(schoolIdOf(headOfTransport), request);
	}

	@PatchMapping("/{id}/revoke")
	public AccountResponse revokeParent(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return accountService.revokeParent(schoolIdOf(headOfTransport), headOfTransport.getId(), id);
	}

	@PatchMapping("/{id}/restore")
	public AccountResponse restoreParent(@AuthenticationPrincipal User headOfTransport, @PathVariable UUID id) {
		return accountService.restoreParent(schoolIdOf(headOfTransport), headOfTransport.getId(), id);
	}

	private UUID schoolIdOf(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport.getSchoolId();
	}
}
