package com.wassel.backend.runs.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalTime;
import java.util.UUID;

/**
 * The first stop of a run still to do, for the head of transportation (SCRUM-262). {@code plannedTime} is the schedule
 * (morning only) and {@code estimate} the live estimate, null unless the bus's position is {@code LIVE} and the stop
 * has a pin.
 */
public record NextStopResponse(UUID studentId, String firstName, String lastName,
		@JsonFormat(pattern = "HH:mm") LocalTime plannedTime, EstimateResponse estimate) {
}
