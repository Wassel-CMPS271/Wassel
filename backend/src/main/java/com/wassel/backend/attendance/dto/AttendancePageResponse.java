package com.wassel.backend.attendance.dto;

import java.time.LocalDate;
import java.util.List;

/** One page of rows or audit entries; {@code total} counts every match, not just this page. Our own record, never Spring's Page. */
public record AttendancePageResponse<T>(LocalDate from, LocalDate to, int page, int size, long total, List<T> items) {
}
