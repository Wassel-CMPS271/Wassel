package com.wassel.backend.students.dto;

import java.util.List;

/** From 1 to 500 rows. Not {@code @Valid}: one bad row rejects that row only, so the rows are checked one by one. */
public record ImportStudentsRequest(List<ImportStudentRow> students) {
}
