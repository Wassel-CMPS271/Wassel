package com.wassel.backend.parent.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.wassel.backend.runs.dto.ChildRunResponse;

import java.time.LocalTime;
import java.util.UUID;

/**
 * A child linked to the signed-in parent (docs/contracts/runs.md). {@code route} is {@code null}
 * when the child isn't on a route yet, and then {@code driver}, {@code vehicle} and
 * {@code expectedPickupTime} are null too; with a route, {@code driver} and {@code vehicle} are
 * always set (a route always has both). {@code todayRun} (SCRUM-237) is today's run state and stops left,
 * null when the child has no route or today is a holiday.
 */
public record ChildResponse(
		UUID studentId,
		String firstName,
		String lastName,
		ChildRouteResponse route,
		ChildDriverResponse driver,
		ChildVehicleResponse vehicle,
		@JsonFormat(pattern = "HH:mm") LocalTime expectedPickupTime,
		ChildRunResponse todayRun) {
}
