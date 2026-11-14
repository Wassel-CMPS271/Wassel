package com.wassel.backend.inbox.dto;

import com.wassel.backend.inbox.entity.InboxEvent;
import com.wassel.backend.inbox.entity.InboxEventType;

import java.time.Instant;
import java.util.UUID;

/** An inbox entry as docs/contracts/inbox.md shows it. {@code direction} is {@code MORNING} or {@code AFTERNOON}. */
public record InboxEventResponse(UUID id, InboxEventType type, UUID studentId, String studentName, UUID runId,
		String direction, Instant createdAt, Instant readAt) {

	public static InboxEventResponse of(InboxEvent event) {
		return new InboxEventResponse(event.getId(), event.getType(), event.getStudentId(), event.getStudentName(),
				event.getRunId(), event.getDirection(), event.getCreatedAt(), event.getReadAt());
	}
}
