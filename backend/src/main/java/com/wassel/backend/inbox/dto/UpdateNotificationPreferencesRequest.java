package com.wassel.backend.inbox.dto;

import com.wassel.backend.inbox.entity.NotificationPreference;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** The body of {@code PUT /api/parent/notification-preferences}: every choice, so the answer never depends on what was saved before. */
public record UpdateNotificationPreferencesRequest(
		@NotNull Boolean pickedUp,
		@NotNull Boolean droppedOff,
		@NotNull Boolean notPresent,
		@NotNull Boolean late,
		@NotNull @Min(NotificationPreference.MIN_LATE_AFTER_MINUTES) @Max(NotificationPreference.MAX_LATE_AFTER_MINUTES)
		Integer lateAfterMinutes) {
}
