package com.wassel.backend.runs.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalTime;

/**
 * What a parent may draw for a child's bus, and how far it has got (SCRUM-261, SCRUM-262). {@code position} is set
 * exactly when the status is not UNAVAILABLE. {@code stopsLeft} and {@code plannedTime} (the schedule, morning only)
 * are set while the child is still waiting, whatever the GPS says; {@code estimate} only while the status is LIVE.
 */
public record BusLocationResponse(LocationStatus status, BusPositionResponse position, Integer stopsLeft,
		@JsonFormat(pattern = "HH:mm") LocalTime plannedTime, EstimateResponse estimate) {

	public BusLocationResponse {
		if ((status == LocationStatus.UNAVAILABLE) != (position == null)) {
			throw new IllegalArgumentException("A position is shown exactly when the status is not UNAVAILABLE");
		}
		if (estimate != null && status != LocationStatus.LIVE) {
			throw new IllegalArgumentException("An estimate is only ever made from a LIVE position");
		}
	}

	public static final BusLocationResponse UNAVAILABLE = new BusLocationResponse(LocationStatus.UNAVAILABLE, null,
			null, null, null);

	public BusLocationResponse withProgress(Integer stopsLeft, LocalTime plannedTime, EstimateResponse estimate) {
		return new BusLocationResponse(status, position, stopsLeft, plannedTime, estimate);
	}
}
