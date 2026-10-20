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
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * The pending suggestion for all of a school's routes (SCRUM-207); its planned routes are
 * {@link FleetProposalRoute} rows. {@code fingerprint} summarises the data it was made from, which
 * apply compares with the data then to tell whether anything changed in between. The unique
 * {@code school_id} is what keeps it to one per school.
 */
@Entity
@Table(name = "fleet_proposals",
		uniqueConstraints = @UniqueConstraint(name = "uq_fleet_proposals_school", columnNames = "school_id"))
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FleetProposal {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(nullable = false, updatable = false, length = 100)
	private String fingerprint;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
