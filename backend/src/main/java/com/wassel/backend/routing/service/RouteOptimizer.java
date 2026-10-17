package com.wassel.backend.routing.service;

import java.time.Duration;
import java.time.LocalTime;
import java.util.List;
import java.util.Objects;
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
	 *
	 * <p>{@code stops} must not be empty and every stop has a pin: the caller rejects a route
	 * with no stops, or with students who have no pin, before calling. An empty list is still
	 * answered, with a feasible plan that has no stops and zero driving time.
	 */
	Plan optimize(List<Stop> stops, Coordinate school, int capacity, LocalTime schoolArrivalTime);

	/** A pickup: the student and where to collect them. */
	record Stop(UUID studentId, Coordinate location) {

		public Stop {
			Objects.requireNonNull(studentId, "studentId");
			Objects.requireNonNull(location, "a stop needs a map pin");
		}
	}

	/** A stop in the proposed order, with the time the vehicle is expected there. */
	record PlannedStop(UUID studentId, LocalTime arrivalTime) {

		public PlannedStop {
			Objects.requireNonNull(studentId, "studentId");
			Objects.requireNonNull(arrivalTime, "arrivalTime");
		}
	}

	/** Why a route is not feasible. The names are the codes in the contract. */
	enum Code {
		CAPACITY_EXCEEDED,
		ARRIVAL_TIME_UNREACHABLE
	}

	/** One reason: {@code code} is stable and for programs, {@code message} is for people. */
	record Reason(Code code, String message) {

		public Reason {
			Objects.requireNonNull(code, "code");
			Objects.requireNonNull(message, "message");
		}
	}

	/**
	 * The outcome. A feasible plan has no reasons. A plan that is not feasible has at least one
	 * reason, no stops, and a zero {@code totalDrivingTime}. Anything else is rejected here, so
	 * a consumer can rely on it. {@code totalDrivingTime} runs from the first pickup to the school.
	 */
	record Plan(boolean feasible, List<PlannedStop> stops, Duration totalDrivingTime, List<Reason> reasons) {

		public Plan {
			Objects.requireNonNull(totalDrivingTime, "totalDrivingTime");
			stops = List.copyOf(stops);
			reasons = List.copyOf(reasons);
			if (feasible != reasons.isEmpty()) {
				throw new IllegalArgumentException(
						"a feasible plan has no reasons and a plan that is not feasible has at least one");
			}
			if (!feasible && (!stops.isEmpty() || !totalDrivingTime.isZero())) {
				throw new IllegalArgumentException(
						"a plan that is not feasible has no stops and a zero driving time");
			}
		}
	}
}
