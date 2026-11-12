package com.wassel.backend.inbox.controller;

import com.wassel.backend.inbox.dto.NotificationPreferencesResponse;
import com.wassel.backend.inbox.dto.UpdateNotificationPreferencesRequest;
import com.wassel.backend.inbox.service.NotificationPreferenceService;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in parent's own notification choices. The school and the parent are always taken from the authenticated
 * user, never from the request.
 */
@RestController
@RequestMapping("/api/parent/notification-preferences")
@PreAuthorize("hasRole('PARENT')")
@RequiredArgsConstructor
public class NotificationPreferencesController {

	private final NotificationPreferenceService preferenceService;

	@GetMapping
	public NotificationPreferencesResponse get(@AuthenticationPrincipal User parent) {
		signedIn(parent);
		return preferenceService.get(parent.getSchoolId(), parent.getId());
	}

	@PutMapping
	public NotificationPreferencesResponse update(@AuthenticationPrincipal User parent,
			@Valid @RequestBody UpdateNotificationPreferencesRequest request) {
		signedIn(parent);
		return preferenceService.update(parent.getSchoolId(), parent.getId(), request);
	}

	// Same principal assumption as ParentInboxController.
	private static void signedIn(User parent) {
		if (parent == null) {
			throw new AccessDeniedException("No authenticated parent");
		}
	}
}
