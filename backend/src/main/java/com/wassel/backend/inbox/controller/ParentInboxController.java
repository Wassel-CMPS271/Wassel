package com.wassel.backend.inbox.controller;

import com.wassel.backend.inbox.dto.InboxEventResponse;
import com.wassel.backend.inbox.dto.UnreadCountResponse;
import com.wassel.backend.inbox.service.InboxService;
import com.wassel.backend.users.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The signed-in parent's own inbox. The school and the parent are always taken from the authenticated user, never
 * from the request.
 */
@RestController
@RequestMapping("/api/parent/inbox")
@PreAuthorize("hasRole('PARENT')")
@RequiredArgsConstructor
public class ParentInboxController {

	private final InboxService inboxService;

	@GetMapping
	public List<InboxEventResponse> list(@AuthenticationPrincipal User parent,
			@RequestParam(defaultValue = "false") boolean unread) {
		signedIn(parent);
		return inboxService.list(parent.getSchoolId(), parent.getId(), unread);
	}

	@GetMapping("/unread-count")
	public UnreadCountResponse unreadCount(@AuthenticationPrincipal User parent) {
		signedIn(parent);
		return inboxService.unreadCount(parent.getSchoolId(), parent.getId());
	}

	@PostMapping("/{id}/read")
	public InboxEventResponse markRead(@AuthenticationPrincipal User parent, @PathVariable UUID id) {
		signedIn(parent);
		return inboxService.markRead(parent.getSchoolId(), parent.getId(), id);
	}

	@PostMapping("/read-all")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void markAllRead(@AuthenticationPrincipal User parent) {
		signedIn(parent);
		inboxService.markAllRead(parent.getSchoolId(), parent.getId());
	}

	// Same principal assumption as SchoolSettingsController (see its SCRUM-168 TODO): change
	// every controller together if the JWT filter ever uses a different principal type.
	private static void signedIn(User parent) {
		if (parent == null) {
			throw new AccessDeniedException("No authenticated parent");
		}
	}
}
