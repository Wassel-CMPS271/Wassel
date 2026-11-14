package com.wassel.backend.addressrequests.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A parent's request to change one child's pickup address (SCRUM-269, docs/contracts/address-requests.md). The
 * student's name and address and the parent's email are copied when the request is made, so the row reads the same
 * later whatever happens to them; the ids are plain, as the {@code students} module owns that id.
 *
 * <p>Only {@link #status}, {@link #decidedAt} and {@link #rejectionReason} ever change, once, from
 * {@code PENDING}, under the row lock of {@code AddressRequestRepository#findLockedBySchoolIdAndId}. The database
 * allows one pending request per student (a partial unique index in {@code V11__address_requests.sql}).
 */
@Entity
@Table(name = "address_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AddressRequest {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "student_id", nullable = false, updatable = false)
	private UUID studentId;

	@Column(name = "student_name", nullable = false, updatable = false)
	private String studentName;

	@Column(name = "current_address", updatable = false)
	private String currentAddress;

	@Column(name = "requested_address", nullable = false, updatable = false)
	private String requestedAddress;

	@Column(name = "requested_lat", updatable = false)
	private BigDecimal requestedLat;

	@Column(name = "requested_lng", updatable = false)
	private BigDecimal requestedLng;

	@Column(name = "requested_by_user_id", nullable = false, updatable = false)
	private UUID requestedByUserId;

	@Column(name = "requested_by_email", nullable = false, updatable = false)
	private String requestedByEmail;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private AddressRequestStatus status;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "decided_at")
	private Instant decidedAt;

	@Column(name = "rejection_reason")
	private String rejectionReason;
}
