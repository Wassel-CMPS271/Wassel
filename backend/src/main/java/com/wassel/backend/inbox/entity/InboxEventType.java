package com.wassel.backend.inbox.entity;

/**
 * What happened to the child. The first three are the names of {@code runs.entity.ConfirmationStatus}, which the event
 * carries as text; {@code LATE} (SCRUM-268) is made by the late-alert job, not by a confirmation.
 */
public enum InboxEventType {
	PICKED_UP,
	DROPPED_OFF,
	NOT_PRESENT,
	LATE
}
