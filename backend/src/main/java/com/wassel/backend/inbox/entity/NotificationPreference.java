package com.wassel.backend.inbox.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/**
 * One parent's choices (SCRUM-268, docs/contracts/inbox.md "Notification preferences"). Rows are written only by
 * {@code NotificationPreferenceRepository.upsert}, one statement that makes the row or replaces it, so there are no setters.
 */
@Entity
@Table(name = "notification_preferences")
@Getter
@NoArgsConstructor
public class NotificationPreference {

	/** The shortest and the longest delay a parent may ask to be told about, in minutes. */
	public static final int MIN_LATE_AFTER_MINUTES = 5;

	public static final int MAX_LATE_AFTER_MINUTES = 60;

	@Id
	@Column(name = "parent_user_id", nullable = false, updatable = false)
	private UUID parentUserId;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "picked_up", nullable = false, updatable = false)
	private boolean pickedUp;

	@Column(name = "dropped_off", nullable = false, updatable = false)
	private boolean droppedOff;

	@Column(name = "not_present", nullable = false, updatable = false)
	private boolean notPresent;

	@Column(nullable = false, updatable = false)
	private boolean late;

	@Column(name = "late_after_minutes", nullable = false, updatable = false)
	private int lateAfterMinutes;

	@Column(name = "updated_at", nullable = false, updatable = false)
	private Instant updatedAt;
}
