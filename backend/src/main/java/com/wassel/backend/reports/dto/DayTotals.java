package com.wassel.backend.reports.dto;

import java.time.LocalDate;

/** One date of the transport totals; every date of the range is listed, with zeros when nothing happened. */
public record DayTotals(LocalDate date, long runs, long runsFinished, long pickedUp, long droppedOff,
		long notPresent, long absent) {
}
