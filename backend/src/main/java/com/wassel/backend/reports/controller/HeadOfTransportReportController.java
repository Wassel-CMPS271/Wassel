package com.wassel.backend.reports.controller;

import com.wassel.backend.reports.dto.TransportTotalsResponse;
import com.wassel.backend.reports.service.ReportService;
import com.wassel.backend.users.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

/**
 * The head of transportation's transport totals and their export for a date range. The school is always taken from the
 * authenticated user, never from the request.
 */
@RestController
@RequestMapping("/api/head-of-transport/transport-totals")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class HeadOfTransportReportController {

	private static final MediaType CSV = new MediaType("text", "csv", StandardCharsets.UTF_8);

	private final ReportService reportService;

	@GetMapping
	public TransportTotalsResponse totals(@AuthenticationPrincipal User headOfTransport,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		return reportService.totals(schoolIdOf(headOfTransport), from, to);
	}

	@GetMapping("/export")
	public ResponseEntity<String> export(@AuthenticationPrincipal User headOfTransport,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		TransportTotalsResponse totals = reportService.totals(schoolIdOf(headOfTransport), from, to);
		return ResponseEntity.ok()
				.contentType(CSV)
				.header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
						.filename("wassel-transport-" + totals.from() + "_" + totals.to() + ".csv").build().toString())
				.body(reportService.csv(totals));
	}

	private static UUID schoolIdOf(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport.getSchoolId();
	}
}
