package com.wassel.backend.accounts.dto;

import java.time.Instant;
import java.util.UUID;

/** {@code status} is {@code "invited"} until the person sets a password, then {@code "active"}. */
public record AccountResponse(UUID id, String email, String status, Instant createdAt) {
}
