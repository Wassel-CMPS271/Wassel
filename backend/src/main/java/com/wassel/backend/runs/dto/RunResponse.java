package com.wassel.backend.runs.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.wassel.backend.routes.dto.RouteDriverSummary;
import com.wassel.backend.routes.dto.RouteVehicleSummary;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunState;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/**
 * One route, one direction, one date (docs/contracts/runs.md). {@code stops} is left out of the JSON
 * when null, which is the contract's {@code RunSummary}: the head of transportation's list.
 */
public record RunResponse(
		UUID id,
		LocalDate date,
		RunDirection direction,
		RunState state,
		@JsonFormat(pattern = "HH:mm") LocalTime schoolTime,
		Instant startedAt,
		Instant endedAt,
		RunRouteResponse route,
		RouteVehicleSummary vehicle,
		RouteDriverSummary driver,
		RunCountsResponse counts,
		@JsonInclude(JsonInclude.Include.NON_NULL) List<RunStopResponse> stops) {
}
