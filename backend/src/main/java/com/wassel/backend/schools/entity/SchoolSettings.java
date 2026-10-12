package com.wassel.backend.schools.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

/**
 * Per-school configuration. There is exactly one row per school, keyed by
 * {@link #schoolId} (the tenant boundary, see the schoolId field on the user entity).
 *
 * <p>The arrival and dismissal times are hard constraints for later route optimization.
 * Both are null until an admin sets them for the first time.
 */
@Entity
@Table(name = "school_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SchoolSettings {

	@Id
	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	/** Time students are due at school in the morning. */
	@Column(name = "arrival_time")
	private LocalTime arrivalTime;

	/** Time school ends and students are picked up. Always after {@link #arrivalTime}. */
	@Column(name = "dismissal_time")
	private LocalTime dismissalTime;

	@UpdateTimestamp
	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;
}
