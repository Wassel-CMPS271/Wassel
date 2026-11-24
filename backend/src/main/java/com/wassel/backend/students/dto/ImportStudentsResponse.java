package com.wassel.backend.students.dto;

import java.util.List;

/** One result per request row, in request order; {@code created + rejected} is the number of rows sent. */
public record ImportStudentsResponse(int created, int rejected, List<ImportRowResult> results) {
}
