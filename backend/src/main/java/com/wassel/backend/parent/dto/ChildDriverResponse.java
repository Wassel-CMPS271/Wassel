package com.wassel.backend.parent.dto;

import java.util.UUID;

/** {@code phone} is for the parent screen's "Call driver" button. */
public record ChildDriverResponse(UUID id, String firstName, String lastName, String phone) {
}
