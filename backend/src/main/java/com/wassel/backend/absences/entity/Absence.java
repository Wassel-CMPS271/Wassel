package com.wassel.backend.absences.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A child reported absent for one day or an inclusive date range, covering both runs of every
 * day it spans. Every absence belongs to exactly one school ({@link #schoolId}, the tenant
 * boundary) and one student ({@link #studentId}; the {@code students} module owns that id, so
 * this module never imports its entity).
 *
 * <p>{@link #cancelled} is set, never a physical delete, when a parent cancels an absence that
 * hasn't started yet (contract: "Cancel deletes an absence whose fromDate is today or later") —
 * kept as history rather than removed, the same way a used {@code PasswordToken} or a claimed
 * {@code RouteProposal} stays a row instead of disappearing. Every query that should ignore a
 * cancelled absence filters {@code cancelled = false} explicitly, so a cancelled absence is
 * "gone" to every caller without actually being deleted. An absence that has <em>already
 * started</em> is never cancelled this way: {@link com.wassel.backend.absences.service.AbsenceService}
 * shortens its {@link #toDate} to yesterday instead, so the days already gone by stay recorded
 * as a real, un-cancelled absence.
 *
 * <p>The database-level guard against two overlapping, non-cancelled absences for the same
 * student — the backstop for {@code AbsenceService}'s check-then-insert, the same role the
 * unique constraints on {@code routes}/{@code school_holidays} play for theirs — is a PostgreSQL
 * exclusion constraint in the migration (SCRUM-238, {@code V6__absences.sql}), not something JPA
 * has a matching annotation for, so it is not declared again here.
 */
@Entity
@Table(name = "absences")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Absence {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "student_id", nullable = false, updatable = false)
	private UUID studentId;

	@Column(name = "from_date", nullable = false)
	private LocalDate fromDate;

	@Column(name = "to_date", nullable = false)
	private LocalDate toDate;

	@Column(name = "created_by", nullable = false, updatable = false)
	private UUID createdBy;

	@Builder.Default
	@Column(nullable = false)
	private boolean cancelled = false;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
