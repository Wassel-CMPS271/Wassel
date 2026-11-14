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
 * One thing a parent is told about their child on a run (SCRUM-267, docs/contracts/inbox.md). Rows are created only by
 * {@code InboxEventRepository.insertIfMissing} and the only change is {@code readAt}, set once by the repository's
 * statements, so there are no setters. The parent, the child's name and the direction are copied when the event
 * happens.
 */
@Entity
@Table(name = "inbox_events")
@Getter
@NoArgsConstructor
public class InboxEvent {

	@Id
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "parent_user_id", nullable = false, updatable = false)
	private UUID parentUserId;

	@Column(name = "student_id", nullable = false, updatable = false)
	private UUID studentId;

	@Column(name = "student_name", nullable = false, updatable = false)
	private String studentName;

	@Column(name = "run_id", nullable = false, updatable = false)
	private UUID runId;

	@Column(nullable = false, updatable = false)
	private String direction;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, updatable = false)
	private InboxEventType type;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "read_at", updatable = false)
	private Instant readAt;
}
