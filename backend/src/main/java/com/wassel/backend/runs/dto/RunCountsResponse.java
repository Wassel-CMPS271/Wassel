package com.wassel.backend.runs.dto;

/** {@code students} counts the stops on the run, absent ones included. The rest need confirmations and absences. */
public record RunCountsResponse(int students, int absent, int pickedUp, int droppedOff, int notPresent) {
}
