package com.wassel.backend.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * One authentication email we asked the provider to send (SCRUM-289, docs/contracts/auth-email.md). Counted for the
 * daily cap. Holds no address. {@code createdAt} comes from the app's clock, not the database's.
 */
@Entity
@Table(name = "auth_emails")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuthEmail {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private AuthEmailKind kind;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	public static AuthEmail of(UUID userId, AuthEmailKind kind, Instant createdAt) {
		AuthEmail email = new AuthEmail();
		email.userId = Objects.requireNonNull(userId);
		email.kind = Objects.requireNonNull(kind);
		email.createdAt = Objects.requireNonNull(createdAt);
		return email;
	}
}
