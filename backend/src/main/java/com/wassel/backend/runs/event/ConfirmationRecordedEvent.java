package com.wassel.backend.runs.event;

import java.time.Instant;
import java.util.UUID;

/**
 * Published, inside the confirmation's own transaction, when a driver's confirmation was saved for the first time
 * (a retry of a status the student already has publishes nothing). Other modules react without {@code runs}
 * depending on them, the way {@code auth.event.PasswordSetEvent} works; the inbox (SCRUM-267) is the first.
 * {@code status} is a {@code ConfirmationStatus} name and {@code direction} a {@code RunDirection} name, as text
 * so a listener does not import runs entities.
 */
public record ConfirmationRecordedEvent(UUID schoolId, UUID runId, UUID studentId, String direction, String status,
		Instant occurredAt) {
}
