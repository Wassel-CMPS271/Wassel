package com.wassel.backend.routes.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalTime;

/** The student was put on the best route (SCRUM-270): where, what it added, and the route as it is now. */
public record BestRoutePlacementResponse(int position, int extraMinutes,
		@JsonFormat(pattern = "HH:mm") LocalTime arrivalTime, RouteResponse route) {
}
