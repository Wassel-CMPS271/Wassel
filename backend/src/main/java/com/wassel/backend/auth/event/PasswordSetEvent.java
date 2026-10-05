package com.wassel.backend.auth.event;

import java.util.UUID;

/** Published when a user sets a password from a link, so other modules can react without auth depending on them. */
public record PasswordSetEvent(UUID userId) {
}
