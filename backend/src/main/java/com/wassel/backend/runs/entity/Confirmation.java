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
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/**
 * One status a driver gave one student on one run (SCRUM-235). Rows are only ever added, by
 * {@code ConfirmationRepository.insertIfMissing}, so the unique constraint is what keeps a retry from making a second.
 * No setters: a confirmation is never changed. The builder is for tests that seed one.
 */
@Entity
@Table(
		name = "run_confirmations",
		uniqueConstraints = @UniqueConstraint(
				name = "uq_run_confirmations_run_student_status", columnNames = { "run_id", "student_id", "status" }))
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Confirmation {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "run_id", nullable = false, updatable = false)
	private UUID runId;

	@Column(name = "student_id", nullable = false, updatable = false)
	private UUID studentId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20, updatable = false)
	private ConfirmationStatus status;

	@Column(name = "confirmed_at", nullable = false, updatable = false)
	private Instant confirmedAt;
}
