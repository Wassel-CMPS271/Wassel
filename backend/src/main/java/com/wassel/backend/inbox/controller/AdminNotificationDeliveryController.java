package com.wassel.backend.inbox.controller;

import com.wassel.backend.inbox.dto.NotificationDeliverySummaryResponse;
import com.wassel.backend.inbox.service.NotificationDeliveryService;
import com.wassel.backend.users.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * How the email for inbox entries is going, for the administrator of the school (SCRUM-283,
 * docs/contracts/notification-delivery.md). The school is always taken from the authenticated admin.
 */
@RestController
@RequestMapping("/api/admin/notification-deliveries")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminNotificationDeliveryController {

	private final NotificationDeliveryService deliveryService;

	@GetMapping("/summary")
	public NotificationDeliverySummaryResponse summary(@AuthenticationPrincipal User admin,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		if (admin == null) {
			throw new AccessDeniedException("No authenticated school admin");
		}
		return deliveryService.summary(admin.getSchoolId(), date);
	}
}
