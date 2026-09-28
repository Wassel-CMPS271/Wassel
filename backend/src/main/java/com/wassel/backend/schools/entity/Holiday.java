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
 * A day the school is closed. Each school has at most one holiday per date, and every
 * holiday belongs to exactly one school ({@link #schoolId}, the tenant boundary).
 */
@Entity
@Table(
		name = "school_holidays",
		uniqueConstraints = @UniqueConstraint(
				name = "uq_school_holidays_school_date", columnNames = { "school_id", "holiday_date" }))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Holiday {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "holiday_date", nullable = false)
	private LocalDate date;

	@Column(nullable = false, length = 100)
	private String name;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
