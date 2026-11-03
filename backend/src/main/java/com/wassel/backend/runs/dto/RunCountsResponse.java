package com.wassel.backend.runs.dto;

/**
 * {@code students} counts the stops on the run, absent ones included. {@code pickedUp} counts students whose latest
 * status is {@code PICKED_UP} or {@code DROPPED_OFF}. {@code absent} needs absences (SCRUM-239) and stays 0 until then.
 */
public record RunCountsResponse(int students, int absent, int pickedUp, int droppedOff, int notPresent) {
}
