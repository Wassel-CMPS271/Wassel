package com.wassel.backend.runs.dto;

import java.util.UUID;

/** The head of transportation who made a change: a user has no name yet, so the email. The email is null when the account is gone. */
public record ReassignmentActorResponse(UUID id, String email) {
}
