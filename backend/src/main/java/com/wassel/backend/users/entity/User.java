package com.wassel.backend.users.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * Base user account. Every user belongs to exactly one school ({@link #schoolId}),
 * which is the tenant boundary for all data access.
 */
@Entity
@Table(name = "users", indexes = @Index(name = "idx_users_school_id", columnList = "school_id"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@ToString(exclude = "passwordHash")
public class User {

	// password_hash is NOT NULL, so an invited account stores this instead. It isn't a valid
	// BCrypt hash, so no password ever matches it.
	public static final String NO_PASSWORD_HASH = "!";

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(nullable = false, unique = true)
	private String email;

	@Column(name = "password_hash", nullable = false)
	private String passwordHash;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 32)
	private Role role;

	@Column(name = "school_id", nullable = false)
	private UUID schoolId;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	/** False when an admin or head of transportation revoked access (SCRUM-98). The lockout below is separate. */
	@Builder.Default
	@Column(nullable = false)
	private boolean enabled = true;

	/**
	 * Wrong passwords in a row (SCRUM-171), changed only by {@code UserRepository}'s conditional updates, never
	 * through this field, so parallel sign-ins can't lose a count.
	 */
	@Builder.Default
	@Column(name = "failed_sign_ins", nullable = false)
	private int failedSignIns = 0;

	/** When the current lock ends; a past time or null means not locked. */
	@Column(name = "locked_until")
	private Instant lockedUntil;

	public boolean hasPassword() {
		return !NO_PASSWORD_HASH.equals(passwordHash);
	}
}
