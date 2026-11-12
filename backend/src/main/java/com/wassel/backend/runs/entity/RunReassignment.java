package com.wassel.backend.runs.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One change of a route's driver, made through a run by the head of transportation (SCRUM-264). Written in the same
 * transaction as the change and never updated: no setters, {@code @Immutable} (Hibernate never issues an update), no
 * public constructor, and the builder cannot set the id.
 */
@Entity
@Immutable
@Table(name = "run_reassignments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RunReassignment {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	@Column(updatable = false)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "run_id", nullable = false, updatable = false)
	private UUID runId;

	@Column(name = "route_id", nullable = false, updatable = false)
	private UUID routeId;

	@Column(name = "run_date", nullable = false, updatable = false)
	private LocalDate runDate;

	/** The run's state when the driver changed. */
	@Enumerated(EnumType.STRING)
	@Column(name = "run_state", nullable = false, length = 20, updatable = false)
	private RunState runState;

	@Column(name = "from_driver_id", nullable = false, updatable = false)
	private UUID fromDriverId;

	@Column(name = "to_driver_id", nullable = false, updatable = false)
	private UUID toDriverId;

	@Column(name = "changed_by_user_id", nullable = false, updatable = false)
	private UUID changedByUserId;

	@Column(name = "changed_at", nullable = false, updatable = false)
	private Instant changedAt;

	@Column(length = 200, updatable = false)
	private String reason;

	@Builder
	private RunReassignment(UUID schoolId, UUID runId, UUID routeId, LocalDate runDate, RunState runState,
			UUID fromDriverId, UUID toDriverId, UUID changedByUserId, Instant changedAt, String reason) {
		this.schoolId = schoolId;
		this.runId = runId;
		this.routeId = routeId;
		this.runDate = runDate;
		this.runState = runState;
		this.fromDriverId = fromDriverId;
		this.toDriverId = toDriverId;
		this.changedByUserId = changedByUserId;
		this.changedAt = changedAt;
		this.reason = reason;
	}
}
