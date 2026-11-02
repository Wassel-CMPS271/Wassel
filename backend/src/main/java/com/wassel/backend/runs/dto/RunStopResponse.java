package com.wassel.backend.runs.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.UUID;

/**
 * One student on one run: the routing contract's {@code Stop} plus the guardian and what happened to them.
 * {@code removedFromRoute} marks a student who was confirmed on this run and has since left the route: they stay
 * on the run, last, so a child picked up never disappears from the bus they are on.
 */
public record RunStopResponse(
		UUID studentId,
		int position,
		String firstName,
		String lastName,
		String address,
		BigDecimal latitude,
		BigDecimal longitude,
		@JsonFormat(pattern = "HH:mm") LocalTime arrivalTime,
		String guardianName,
		String guardianPhone,
		boolean absent,
		ConfirmationResponse confirmation,
		boolean removedFromRoute) {

	public RunStopResponse withConfirmation(ConfirmationResponse confirmation) {
		return new RunStopResponse(studentId, position, firstName, lastName, address, latitude, longitude, arrivalTime,
				guardianName, guardianPhone, absent, confirmation, removedFromRoute);
	}

	/**
	 * The same student on the afternoon run: renumbered, without a morning arrival time, and unconfirmed,
	 * because a confirmation belongs to one run. An absence is for the whole day, so it carries over.
	 */
	public RunStopResponse forAfternoon(int position) {
		return new RunStopResponse(studentId, position, firstName, lastName, address, latitude, longitude, null,
				guardianName, guardianPhone, absent, null, removedFromRoute);
	}
}
