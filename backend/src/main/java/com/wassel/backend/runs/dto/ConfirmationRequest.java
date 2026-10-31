package com.wassel.backend.runs.dto;

import com.wassel.backend.runs.entity.ConfirmationStatus;
import jakarta.validation.constraints.NotNull;

/** The body of {@code PUT .../confirmation}. The time is never sent: it is the server's. */
public record ConfirmationRequest(@NotNull ConfirmationStatus status) {
}
