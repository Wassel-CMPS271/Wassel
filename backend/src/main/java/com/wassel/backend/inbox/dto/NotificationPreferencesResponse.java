package com.wassel.backend.inbox.dto;

import com.wassel.backend.inbox.entity.NotificationPreference;

/**
 * A parent's choices: which entries they receive, and how many minutes after the planned pickup time a child still
 * waiting counts as late. A parent who never saved any has {@link #DEFAULTS}.
 */
public record NotificationPreferencesResponse(boolean pickedUp, boolean droppedOff, boolean notPresent, boolean late,
		int lateAfterMinutes) {

	public static final int DEFAULT_LATE_AFTER_MINUTES = 10;

	public static final NotificationPreferencesResponse DEFAULTS = new NotificationPreferencesResponse(true, true,
			true, true, DEFAULT_LATE_AFTER_MINUTES);

	public static NotificationPreferencesResponse of(NotificationPreference saved) {
		return new NotificationPreferencesResponse(saved.isPickedUp(), saved.isDroppedOff(), saved.isNotPresent(),
				saved.isLate(), saved.getLateAfterMinutes());
	}
}
