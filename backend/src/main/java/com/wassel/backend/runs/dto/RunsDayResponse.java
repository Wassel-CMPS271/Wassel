package com.wassel.backend.runs.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * The contract's {@code DriverDay} (runs with stops) and {@code RunsDay} (runs without): the date the
 * answer is for, what kind of day it is, and the runs. A holiday is a normal answer with no runs.
 */
public record RunsDayResponse(LocalDate date, DayType dayType, List<RunResponse> runs) {
}
