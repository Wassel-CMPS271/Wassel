package com.wassel.backend.parent.controller;

import com.wassel.backend.parent.dto.ChildResponse;
import com.wassel.backend.parent.service.ParentService;
import com.wassel.backend.users.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The signed-in parent's own children. The school and the parent are always taken from the
 * authenticated user, never from the request. Named {@code ParentChildrenController}, not
 * {@code ParentController}, because {@code accounts.controller.ParentController} (the head of
 * transportation's parent invite/list) already takes that bean name.
 */
@RestController
@RequestMapping("/api/parent/children")
@PreAuthorize("hasRole('PARENT')")
@RequiredArgsConstructor
public class ParentChildrenController {

	private final ParentService parentService;

	@GetMapping
	public List<ChildResponse> listChildren(@AuthenticationPrincipal User parent) {
		return parentService.listChildren(schoolIdOf(parent), parent.getId());
	}

	// Same principal assumption as SchoolSettingsController (see its SCRUM-168 TODO): change
	// every controller together if the JWT filter ever uses a different principal type.
	private UUID schoolIdOf(User parent) {
		if (parent == null) {
			throw new AccessDeniedException("No authenticated parent");
		}
		return parent.getSchoolId();
	}
}
