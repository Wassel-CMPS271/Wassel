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
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One route's morning or afternoon run on one date (SCRUM-233). Every run belongs to exactly one school
 * ({@link #schoolId}, the tenant boundary). It holds only the run's own state: the stops, vehicle and
 * driver are read from the route each time, so a route edit changes today's run at once.
 * {@code RunRepository.createMissing} inserts the rows, so the unique constraint is what keeps two
 * simultaneous requests from making a second run.
 */
@Entity
@Table(
		name = "runs",
		uniqueConstraints = @UniqueConstraint(
				name = "uq_runs_route_date_direction", columnNames = { "route_id", "run_date", "direction" }))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Run {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "route_id", nullable = false, updatable = false)
	private UUID routeId;

	@Column(name = "run_date", nullable = false, updatable = false)
	private LocalDate runDate;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20, updatable = false)
	private RunDirection direction;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private RunState state;

	@Column(name = "started_at")
	private Instant startedAt;

	@Column(name = "ended_at")
	private Instant endedAt;
}
