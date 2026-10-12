package com.wassel.backend.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * One pending two-factor login: the emailed code and the token that ties it to the browser that
 * passed the password step. Only SHA-256 hashes are stored. One row per user (unique {@code user_id}),
 * so the database, not a read-then-write check, stops parallel logins from each getting their own
 * guesses. After the insert a row only changes through the repository's conditional updates.
 * Not school-owned: it is looked up by the pending token, before any session exists.
 */
@Entity
@Table(name = "login_codes")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@ToString(exclude = { "pendingHash", "codeHash" })
public class LoginCode {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "user_id", nullable = false, unique = true)
	private UUID userId;

	@Column(name = "pending_hash", nullable = false, unique = true, length = 64)
	private String pendingHash;

	@Column(name = "code_hash", nullable = false, length = 64)
	private String codeHash;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(nullable = false)
	private int attempts;

	@Column(name = "used_at")
	private Instant usedAt;

	@Column(name = "sent_at", nullable = false)
	private Instant sentAt;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
