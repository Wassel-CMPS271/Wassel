package com.wassel.backend.runs.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * A driver's consent to share one run's position, and its latest position (SCRUM-261, docs/contracts/runs.md
 * "Live location"). Rows are written only by {@code RunLocationRepository}'s statements, so there are no setters.
 * The position is empty until the first one arrives, and again after the driver withdraws or the run ends.
 */
@Entity
@Table(name = "run_locations")
@Getter
@NoArgsConstructor
public class RunLocation {

	/** Up to this old a position is {@code LIVE}. shortcut: constants, not settings; make them properties if a second school wants other numbers. */
	public static final Duration LIVE_FOR = Duration.ofSeconds(60);

	/** Up to this old a position is {@code STALE}; after it, it is not shown and the clean-up removes it. */
	public static final Duration SHOWN_FOR = Duration.ofMinutes(5);

	@Id
	@Column(name = "run_id", nullable = false, updatable = false)
	private UUID runId;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "driver_id", nullable = false, updatable = false)
	private UUID driverId;

	@Column(nullable = false, updatable = false)
	private boolean sharing;

	@Column(updatable = false)
	private Double latitude;

	@Column(updatable = false)
	private Double longitude;

	@Column(name = "accuracy_meters", updatable = false)
	private Double accuracyMeters;

	@Column(name = "received_at", updatable = false)
	private Instant receivedAt;
}
