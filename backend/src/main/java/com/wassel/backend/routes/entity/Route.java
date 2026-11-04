package com.wassel.backend.routes.entity;

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
 * A school's route: a name, one vehicle and one driver. Every route belongs to exactly one
 * school ({@link #schoolId}, the tenant boundary). Stops (which students ride it, in what order)
 * are not modelled here yet (SCRUM-209/210): {@code students.route_id} will point back at a
 * route once assignment exists.
 *
 * <p>All routes are the same morning run, so a vehicle or a driver can be on at most one route
 * at a time (enforced in {@code RouteService}, backed by these unique constraints).
 */
@Entity
@Table(
		name = "routes",
		uniqueConstraints = {
				@UniqueConstraint(name = "uq_routes_school_vehicle", columnNames = { "school_id", "vehicle_id" }),
				@UniqueConstraint(name = "uq_routes_school_driver", columnNames = { "school_id", "driver_id" }) })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Route {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(nullable = false, length = 100)
	private String name;

	@Column(name = "vehicle_id", nullable = false)
	private UUID vehicleId;

	@Column(name = "driver_id", nullable = false)
	private UUID driverId;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
