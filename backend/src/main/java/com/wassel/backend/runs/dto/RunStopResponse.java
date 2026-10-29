package com.wassel.backend.runs.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.UUID;

/** One student on one run: the routing contract's {@code Stop} plus the guardian and what happened to them. */
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
		ConfirmationResponse confirmation) {

	/**
	 * The same student on the afternoon run: renumbered, without a morning arrival time, and unconfirmed,
	 * because a confirmation belongs to one run. An absence is for the whole day, so it carries over.
	 */
	public RunStopResponse forAfternoon(int position) {
		return new RunStopResponse(studentId, position, firstName, lastName, address, latitude, longitude, null,
				guardianName, guardianPhone, absent, null);
	}
}
