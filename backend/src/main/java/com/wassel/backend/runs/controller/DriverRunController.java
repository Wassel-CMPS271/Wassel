package com.wassel.backend.runs.controller;

import com.wassel.backend.runs.dto.RunsDayResponse;
import com.wassel.backend.runs.service.RunService;
import com.wassel.backend.users.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in driver's runs. The driver and the school always come from the authenticated principal,
 * never from the request, so a driver can only ever read their own route's runs.
 */
@RestController
@RequestMapping("/api/driver/runs")
@PreAuthorize("hasRole('DRIVER')")
@RequiredArgsConstructor
public class DriverRunController {

	private final RunService runService;

	@GetMapping("/today")
	public RunsDayResponse today(@AuthenticationPrincipal User driver) {
		if (driver == null) {
			throw new AccessDeniedException("No authenticated driver");
		}
		return runService.driverDay(driver);
	}
}
