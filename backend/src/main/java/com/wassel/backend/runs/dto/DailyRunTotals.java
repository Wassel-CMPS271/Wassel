package com.wassel.backend.runs.dto;

import java.time.LocalDate;

/**
 * One day's run figures for the transport totals (SCRUM-271), from the runs and the drivers' confirmations as stored.
 * {@code pickedUp} counts students picked up on a run that day (including those since dropped off), {@code droppedOff}
 * those dropped off, {@code notPresent} those whose latest status on a run is not present; each student once a day.
 */
public record DailyRunTotals(LocalDate date, long runs, long runsFinished, long pickedUp, long droppedOff,
		long notPresent) {
}
