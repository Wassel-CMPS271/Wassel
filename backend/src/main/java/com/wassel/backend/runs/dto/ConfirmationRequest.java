package com.wassel.backend.runs.dto;

import com.wassel.backend.runs.entity.ConfirmationStatus;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The body of {@code PUT .../confirmation}. The time is never sent: it is the server's. {@code clientRequestId} is
 * optional (SCRUM-263): the device's key for one tap, resent unchanged when it replays that tap. It is read as text
 * and checked here, because Jackson turns an empty string for a {@code UUID} into null, which would silently drop
 * the key; an empty, blank or malformed one is rejected (400, "Malformed request body"). Use {@link #key()}.
 */
public record ConfirmationRequest(@NotNull ConfirmationStatus status, String clientRequestId) {

	private static final Pattern UUID_TEXT =
			Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

	public ConfirmationRequest {
		if (clientRequestId != null && !UUID_TEXT.matcher(clientRequestId).matches()) {
			throw new IllegalArgumentException("clientRequestId is not a UUID");
		}
	}

	/** The key, or null when the device sent none. */
	public UUID key() {
		return clientRequestId == null ? null : UUID.fromString(clientRequestId);
	}
}
