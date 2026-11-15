package com.wassel.backend.runs.dto;

import java.util.List;

/** One page of records and how many match in all. */
public record RecordPage<T>(List<T> items, long total) {
}
