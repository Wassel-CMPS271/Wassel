package com.wassel.backend.inbox.entity;

/** What happened to the child. The names are those of {@code runs.entity.ConfirmationStatus}, which the event carries as text. */
public enum InboxEventType {
	PICKED_UP,
	DROPPED_OFF,
	NOT_PRESENT
}
