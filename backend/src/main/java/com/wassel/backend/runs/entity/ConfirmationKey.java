package com.wassel.backend.runs.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/**
 * The {@code clientRequestId} a driver's device sent with a confirmation that was answered 200 (SCRUM-263). Rows are
 * only added, by {@code ConfirmationKeyRepository.insertIfMissing}, and never changed, so there are no setters. The
 * status is bound as its name by the native insert and read back as the enum.
 */
@Entity
@Table(
		name = "confirmation_keys",
		uniqueConstraints = @UniqueConstraint(
				name = "uq_confirmation_keys_driver_key", columnNames = { "driver_user_id", "client_request_id" }))
@Getter
@NoArgsConstructor
public class ConfirmationKey {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "driver_user_id", nullable = false, updatable = false)
	private UUID driverUserId;

	@Column(name = "client_request_id", nullable = false, updatable = false)
	private UUID clientRequestId;

	@Column(name = "run_id", nullable = false, updatable = false)
	private UUID runId;

	@Column(name = "student_id", nullable = false, updatable = false)
	private UUID studentId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20, updatable = false)
	private ConfirmationStatus status;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
