package com.wassel.backend.runs.dto;

import jakarta.validation.constraints.NotNull;

/** The body of {@code PUT .../location-sharing}: opt in, or withdraw. */
public record SharingRequest(@NotNull(message = "Enabled is required") Boolean enabled) {
}
