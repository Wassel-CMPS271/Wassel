package com.wassel.backend.routes.dto;

import java.util.UUID;

/** A student who is on a route now and will not be on it once the proposal is applied. */
public record LeavingStudentResponse(UUID studentId, String firstName, String lastName) {
}
