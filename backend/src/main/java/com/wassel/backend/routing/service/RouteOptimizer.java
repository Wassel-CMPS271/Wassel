package com.wassel.backend.routing.service;

import java.time.Duration;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/**
 * Orders one route's stops. The route is an open path: the first pickup is the start and the
 * school is the end (morning run only, no depot leg). Every stop is one student, so the number
 * of stops is the number of students on board. The optimizer only orders stops inside one route;
 * it never decides which students belong to it.
 */
public interface RouteOptimizer {

	/**
	 * Proposes a stop order that keeps at most {@code capacity} students on board and reaches the
	 * school by {@code schoolArrivalTime} (school-local time). When that is not possible the result
	 * is not feasible and says why in {@link Plan#reasons()}; it is not an exception.
	 */
	Plan optimize(List<Stop> stops, Coordinate school, int capacity, LocalTime schoolArrivalTime);

	/** A pickup: the student and where to collect them. */
	record Stop(UUID studentId, Coordinate location) {
	}

	/** A stop in the proposed order, with the time the vehicle is expected there. */
	record PlannedStop(UUID studentId, LocalTime arrivalTime) {
	}

	/** Why a route is not feasible. {@code code} is stable (see the contract), {@code message} is for people. */
	record Reason(String code, String message) {
	}

	/**
	 * The outcome. {@code stops} is empty when not feasible and {@code reasons} is empty when
	 * feasible. {@code totalDrivingTime} runs from the first pickup to the school.
	 */
	record Plan(boolean feasible, List<PlannedStop> stops, Duration totalDrivingTime, List<Reason> reasons) {
	}
}
