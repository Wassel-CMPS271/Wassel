package com.wassel.backend.routes.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A stop order a route had before an optimizer proposal replaced it (SCRUM-203). Kept, not yet read by anything. */
@Entity
@Table(name = "route_versions")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RouteVersion {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "route_id", nullable = false, updatable = false)
	private UUID routeId;

	@Convert(converter = UuidListConverter.class)
	@Column(name = "stop_order", nullable = false, updatable = false, columnDefinition = "text")
	private List<UUID> stopOrder;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
