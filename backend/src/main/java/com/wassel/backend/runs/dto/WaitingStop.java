package com.wassel.backend.runs.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A child still waiting on a morning run that is in progress (SCRUM-268), for the inbox's late alerts. {@code plannedAt}
 * is the schedule's time for the child's stop as a moment (the school-local {@code HH:mm} of today, in the school's
 * zone). {@code estimatedAt} is the live estimate for the stop, null unless the bus's position is {@code LIVE} and the
 * stop has a pin; it is never earlier than the time of the read. This says nothing about being late: that rule is the
 * inbox's.
 */
public record WaitingStop(UUID schoolId, UUID runId, UUID studentId, Instant plannedAt, Instant estimatedAt) {
}
