package com.wassel.backend.routes.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalTime;
import java.util.UUID;

/**
 * Where one route could take the student (SCRUM-270): the stop position that adds the fewest driving minutes, those
 * minutes, the pickup time the student would get ({@code HH:mm}, school-local) and the seats left before they take one.
 */
public record RouteOptionResponse(UUID routeId, String routeName, int position, int extraMinutes,
		@JsonFormat(pattern = "HH:mm") LocalTime arrivalTime, int seatsLeft) {
}
