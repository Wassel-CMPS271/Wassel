package com.wassel.backend.inbox.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/**
 * The email that goes with one inbox entry (SCRUM-283, docs/contracts/notification-delivery.md). Rows are made and
 * changed only by {@code NotificationDeliveryRepository}'s statements, so there are no setters.
 */
@Entity
@Table(name = "notification_deliveries")
@Getter
@NoArgsConstructor
public class NotificationDelivery {

	@Id
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "inbox_event_id", nullable = false, updatable = false)
	private UUID inboxEventId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, updatable = false)
	private DeliveryStatus status;

	@Column(nullable = false, updatable = false)
	private int attempts;

	@Column(name = "next_attempt_at", nullable = false, updatable = false)
	private Instant nextAttemptAt;

	@Column(name = "claimed_at", updatable = false)
	private Instant claimedAt;

	@Column(name = "sent_at", updatable = false)
	private Instant sentAt;

	@Enumerated(EnumType.STRING)
	@Column(updatable = false)
	private DeliveryReason reason;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
