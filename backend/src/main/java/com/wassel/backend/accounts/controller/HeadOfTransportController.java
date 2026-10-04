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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The admin invites head of transportation accounts into the admin's own school. */
@RestController
@RequestMapping("/api/admin/head-of-transport")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class HeadOfTransportController {

	private final AccountService accountService;

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public AccountResponse inviteHeadOfTransport(@AuthenticationPrincipal User admin,
			@Valid @RequestBody CreateAccountRequest request) {
		if (admin == null) {
			throw new AccessDeniedException("No authenticated admin");
		}
		return accountService.createHeadOfTransport(admin.getSchoolId(), request);
	}
}
