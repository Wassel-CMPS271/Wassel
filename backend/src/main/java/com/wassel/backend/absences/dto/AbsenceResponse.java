package com.wassel.backend.absences.dto;

import java.time.LocalDate;
import java.util.UUID;

/** The parent's view of one absence, matching {@code docs/contracts/samples/runs/absences.json}. */
public record AbsenceResponse(UUID id, UUID studentId, LocalDate fromDate, LocalDate toDate) {
}
