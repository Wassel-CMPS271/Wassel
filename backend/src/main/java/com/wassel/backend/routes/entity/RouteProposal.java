package com.wassel.backend.routes.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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

import java.util.List;
import java.util.UUID;

/**
 * The optimizer's pending suggestion for a route (SCRUM-203). {@code baseOrder} is the route's
 * order when it was made, which apply compares with the route's order then to tell whether the
 * route changed in between. The unique {@code route_id} is what keeps it to one per route.
 */
@Entity
@Table(name = "route_proposals",
		uniqueConstraints = @UniqueConstraint(name = "uq_route_proposals_route", columnNames = "route_id"))
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RouteProposal {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "route_id", nullable = false, updatable = false)
	private UUID routeId;

	@Convert(converter = UuidListConverter.class)
	@Column(name = "base_order", nullable = false, updatable = false, columnDefinition = "text")
	private List<UUID> baseOrder;

	@Convert(converter = UuidListConverter.class)
	@Column(name = "proposed_order", nullable = false, updatable = false, columnDefinition = "text")
	private List<UUID> proposedOrder;
}
