package com.wassel.backend.drivers.entity;

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
import java.util.UUID;

/**
 * A driver in a school's roster. Each school has at most one driver per email and per phone
 * number, and at most one driver per assigned vehicle. Every driver belongs to exactly one
 * school ({@link #schoolId}, the tenant boundary).
 */
@Entity
@Table(
		name = "drivers",
		uniqueConstraints = {
				@UniqueConstraint(name = "uq_drivers_school_email", columnNames = { "school_id", "email" }),
				@UniqueConstraint(name = "uq_drivers_school_phone", columnNames = { "school_id", "phone" }),
				@UniqueConstraint(name = "uq_drivers_school_assigned_vehicle",
						columnNames = { "school_id", "assigned_vehicle_id" }) })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Driver {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "first_name", nullable = false, length = 100)
	private String firstName;

	@Column(name = "last_name", nullable = false, length = 100)
	private String lastName;

	@Column(nullable = false, length = 30)
	private String phone;

	@Column(nullable = false, length = 255)
	private String email;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private DriverStatus status;

	// Set on invite, and refreshed whenever the invite is resent; not a creation-only timestamp.
	@Column(name = "invited_at", nullable = false)
	private Instant invitedAt;

	@Column(name = "assigned_vehicle_id")
	private UUID assignedVehicleId;
}
