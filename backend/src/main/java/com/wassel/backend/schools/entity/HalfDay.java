package com.wassel.backend.schools.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A day school runs but ends early. Each school has at most one half-day per date, and a date
 * can't be both a half-day and a {@link Holiday}. Every half-day belongs to exactly one school
 * ({@link #schoolId}, the tenant boundary).
 */
@Entity
@Table(
		name = "school_half_days",
		uniqueConstraints = @UniqueConstraint(
				name = "uq_school_half_days_school_date", columnNames = { "school_id", "half_day_date" }))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HalfDay {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "half_day_date", nullable = false)
	private LocalDate date;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
