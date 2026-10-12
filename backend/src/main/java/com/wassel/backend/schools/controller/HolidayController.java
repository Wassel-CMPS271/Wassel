package com.wassel.backend.schools.controller;

import com.wassel.backend.schools.dto.CreateHolidayRequest;
import com.wassel.backend.schools.dto.HolidayResponse;
import com.wassel.backend.schools.service.HolidayService;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The school holiday calendar for admins. The school is always taken from the authenticated
 * admin, never from the request, so an admin can only read and change their own school.
 */
@RestController
@RequestMapping("/api/admin/school-calendar/holidays")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class HolidayController {

	private final HolidayService holidayService;

	@GetMapping
	public List<HolidayResponse> listHolidays(@AuthenticationPrincipal User admin) {
		return holidayService.listHolidays(schoolIdOf(admin));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public HolidayResponse addHoliday(@AuthenticationPrincipal User admin,
			@Valid @RequestBody CreateHolidayRequest request) {
		return holidayService.addHoliday(schoolIdOf(admin), request);
	}

	// Same principal assumption as SchoolSettingsController (see its SCRUM-168 TODO): change both
	// together if the JWT filter uses a different principal type.
	private UUID schoolIdOf(User admin) {
		if (admin == null) {
			throw new AccessDeniedException("No authenticated school admin");
		}
		return admin.getSchoolId();
	}
}
