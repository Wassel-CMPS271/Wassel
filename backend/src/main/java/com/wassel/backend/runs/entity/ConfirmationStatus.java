package com.wassel.backend.runs.entity;

/**
 * What the driver did with a student on a run. Declared in rank order: a student's latest status is the
 * highest one they have, because {@code now()} can tie and a retry can arrive late, so time cannot say.
 */
public enum ConfirmationStatus {
	NOT_PRESENT,
	PICKED_UP,
	DROPPED_OFF
}
