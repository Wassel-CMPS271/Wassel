package com.wassel.backend.inbox.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;

/**
 * One day of email deliveries (docs/contracts/notification-delivery.md "DeliverySummary"). {@code counts} (lower-case
 * status names) and {@code reasons} always hold every key. Counts only: no address, name or text.
 */
public record NotificationDeliverySummaryResponse(LocalDate date, boolean emailEnabled, int dailyCap,
		Map<String, Long> counts, Map<String, Long> reasons, long retried, Instant oldestPendingAt) {
}
