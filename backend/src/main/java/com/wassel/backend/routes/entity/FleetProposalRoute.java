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

import java.util.List;
import java.util.UUID;

/**
 * One route of a {@link FleetProposal}: the vehicle and driver it uses, the route it updates
 * ({@code routeId}, null when apply creates it), the name it gets, and its students in stop order.
 */
@Entity
@Table(name = "fleet_proposal_routes")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FleetProposalRoute {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "proposal_id", nullable = false, updatable = false)
	private UUID proposalId;

	@Column(name = "vehicle_id", nullable = false, updatable = false)
	private UUID vehicleId;

	@Column(name = "driver_id", nullable = false, updatable = false)
	private UUID driverId;

	@Column(name = "route_id", updatable = false)
	private UUID routeId;

	@Column(nullable = false, updatable = false, length = 100)
	private String name;

	@Convert(converter = UuidListConverter.class)
	@Column(name = "stop_order", nullable = false, updatable = false, columnDefinition = "text")
	private List<UUID> stopOrder;
}
