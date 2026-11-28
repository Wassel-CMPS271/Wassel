package com.wassel.backend.monitoring.controller;

import com.wassel.backend.monitoring.dto.MetricsResponse;
import com.wassel.backend.monitoring.service.OperationalMetrics;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Whether the platform is healthy, for the administrator (SCRUM-290, docs/contracts/admin-metrics.md): the one
 * place these numbers are readable. Not an actuator endpoint, so {@code /actuator/health} stays the only public one.
 * The numbers are the backend's own, not one school's, and the MVP serves a single school.
 */
@RestController
@RequestMapping("/api/admin/metrics")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminMetricsController {

	private final OperationalMetrics metrics;

	@GetMapping
	public MetricsResponse metrics() {
		return metrics.snapshot();
	}
}
