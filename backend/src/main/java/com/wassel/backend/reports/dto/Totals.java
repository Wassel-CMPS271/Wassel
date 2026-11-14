package com.wassel.backend.reports.dto;

/** The days of the range added up, student-days and run counts (a student on two days counts twice). */
public record Totals(long runs, long runsFinished, long pickedUp, long droppedOff, long notPresent, long absent) {
}
