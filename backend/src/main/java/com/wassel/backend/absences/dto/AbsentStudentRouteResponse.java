package com.wassel.backend.absences.dto;

import java.util.UUID;

/** The {@code route} field of {@code AbsentStudentResponse}: just enough to label it, never null when the student has one. */
public record AbsentStudentRouteResponse(UUID id, String name) {
}
