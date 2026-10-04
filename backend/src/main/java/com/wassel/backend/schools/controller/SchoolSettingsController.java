package com.wassel.backend.schools.controller;

import com.wassel.backend.schools.dto.SchoolTimesRequest;
import com.wassel.backend.schools.dto.SchoolTimesResponse;
import com.wassel.backend.schools.service.SchoolSettingsService;
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

import java.util.UUID;

/**
 * School configuration for admins. The school is always taken from the authenticated
 * admin, never from the request, so an admin can only read and change their own school.
 */
@RestController
@RequestMapping("/api/admin/school-settings")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class SchoolSettingsController {

	private final SchoolSettingsService schoolSettingsService;

	@GetMapping("/times")
	public SchoolTimesResponse getTimes(@AuthenticationPrincipal User admin) {
		return schoolSettingsService.getTimes(schoolIdOf(admin));
	}

	@PutMapping("/times")
	public SchoolTimesResponse updateTimes(@AuthenticationPrincipal User admin,
			@Valid @RequestBody SchoolTimesRequest request) {
		return schoolSettingsService.updateTimes(schoolIdOf(admin), request);
	}

	// The auth module's JwtAuthenticationFilter sets the User entity as the principal.
	private UUID schoolIdOf(User admin) {
		if (admin == null) {
			throw new AccessDeniedException("No authenticated school admin");
		}
		return admin.getSchoolId();
	}
}
