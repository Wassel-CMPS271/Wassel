package com.wassel.backend.accounts.dto;

import java.time.Instant;
import java.util.UUID;

/** {@code status} is {@code "invited"} until the person sets a password, then {@code "active"}; {@code "revoked"}
 * while their access is revoked (SCRUM-98), whatever else is true of the account. */
public record AccountResponse(UUID id, String email, String status, Instant createdAt) {
}
