package com.wassel.backend.accounts.service;

import com.wassel.backend.accounts.dto.AccountResponse;
import com.wassel.backend.accounts.dto.CreateAccountRequest;
import com.wassel.backend.auth.service.PasswordService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** Creates accounts with no password and emails the set-password link. Always within the caller's school. */
@Service
@RequiredArgsConstructor
public class AccountService {

	private final UserService userService;

	private final PasswordService passwordService;

	@Transactional
	public AccountResponse createParent(UUID schoolId, CreateAccountRequest request) {
		return invite(schoolId, Role.PARENT, request);
	}

	@Transactional
	public AccountResponse createHeadOfTransport(UUID schoolId, CreateAccountRequest request) {
		return invite(schoolId, Role.HEAD_OF_TRANSPORT, request);
	}

	/** Revoking and restoring (SCRUM-98): a revoked account can't sign in, and an open session ends at its next request. */
	@Transactional
	public AccountResponse revokeParent(UUID schoolId, UUID actorId, UUID parentId) {
		return toResponse(userService.setEnabled(schoolId, actorId, parentId, Role.PARENT, false));
	}

	@Transactional
	public AccountResponse restoreParent(UUID schoolId, UUID actorId, UUID parentId) {
		return toResponse(userService.setEnabled(schoolId, actorId, parentId, Role.PARENT, true));
	}

	@Transactional
	public AccountResponse revokeHeadOfTransport(UUID schoolId, UUID actorId, UUID headOfTransportId) {
		return toResponse(userService.setEnabled(schoolId, actorId, headOfTransportId, Role.HEAD_OF_TRANSPORT, false));
	}

	@Transactional
	public AccountResponse restoreHeadOfTransport(UUID schoolId, UUID actorId, UUID headOfTransportId) {
		return toResponse(userService.setEnabled(schoolId, actorId, headOfTransportId, Role.HEAD_OF_TRANSPORT, true));
	}

	public List<AccountResponse> listParents(UUID schoolId) {
		return userService.listByRole(schoolId, Role.PARENT).stream().map(this::toResponse).toList();
	}

	private AccountResponse invite(UUID schoolId, Role role, CreateAccountRequest request) {
		User user = userService.createInvitedUser(request.email(), role, schoolId);
		passwordService.sendInvite(user);
		return toResponse(user);
	}

	private AccountResponse toResponse(User user) {
		String status = !user.isEnabled() ? "revoked" : user.hasPassword() ? "active" : "invited";
		return new AccountResponse(user.getId(), user.getEmail(), status, user.getCreatedAt());
	}
}
