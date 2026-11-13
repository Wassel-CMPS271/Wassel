package com.wassel.backend.inbox.dto;

import com.wassel.backend.inbox.entity.NotificationPreference;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * The body of {@code PUT /api/parent/notification-preferences}: every choice, so the answer never depends on what was
 * saved before. A value of the wrong type is a 400 and saves nothing (docs/contracts/inbox.md): {@link StrictScalar}
 * reads each field exactly as JSON writes it, for this request only.
 */
public record UpdateNotificationPreferencesRequest(
		@NotNull @JsonDeserialize(using = StrictScalar.Bool.class) Boolean pickedUp,
		@NotNull @JsonDeserialize(using = StrictScalar.Bool.class) Boolean droppedOff,
		@NotNull @JsonDeserialize(using = StrictScalar.Bool.class) Boolean notPresent,
		@NotNull @JsonDeserialize(using = StrictScalar.Bool.class) Boolean late,
		@NotNull @JsonDeserialize(using = StrictScalar.Int.class)
		@Min(NotificationPreference.MIN_LATE_AFTER_MINUTES) @Max(NotificationPreference.MAX_LATE_AFTER_MINUTES)
		Integer lateAfterMinutes) {
}
