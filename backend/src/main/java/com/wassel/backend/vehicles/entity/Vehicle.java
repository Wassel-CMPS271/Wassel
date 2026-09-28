package com.wassel.backend.vehicles.entity;

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
import java.util.UUID;

/**
 * A vehicle in a school's fleet. Each school has at most one vehicle per plate number, and
 * every vehicle belongs to exactly one school ({@link #schoolId}, the tenant boundary).
 */
@Entity
@Table(
		name = "vehicles",
		uniqueConstraints = @UniqueConstraint(
				name = "uq_vehicles_school_plate_number", columnNames = { "school_id", "plate_number" }))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Vehicle {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "plate_number", nullable = false, length = 20)
	private String plateNumber;

	@Column(nullable = false)
	private int capacity;

	@Builder.Default
	@Column(name = "is_active", nullable = false)
	private boolean active = true;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
