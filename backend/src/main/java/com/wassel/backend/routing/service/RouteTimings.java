package com.wassel.backend.routing.service;

import java.time.Duration;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

/**
 * The arrival-time rule from the routing contract, written once: arrival times are worked
 * backwards from the school's arrival time over the legs of {@link TravelTimes}. The solver, the
 * route's own arrival times (SCRUM-212) and {@code current} in a proposal (SCRUM-203) all use it,
 * so the numbers cannot drift apart.
 */
public final class RouteTimings {

	/**
	 * The bus does not start before this. A route whose first pickup would be earlier cannot be
	 * driven. ponytail: one school, so one constant; make it a school setting when a second school
	 * needs another time.
	 */
	public static final LocalTime EARLIEST_FIRST_PICKUP = LocalTime.of(6, 0);

	private RouteTimings() {
	}

	/**
	 * The outcome. {@code arrivals} has one time per stop in visiting order, or is empty when the
	 * first pickup would fall before midnight ({@code crossesMidnight}), where a time of day cannot
	 * say it. {@code drivingTime} is the sum of the legs, first pickup to school, and is always set.
	 */
	public record Timing(List<LocalTime> arrivals, Duration drivingTime, boolean crossesMidnight) {

		public Timing {
			arrivals = List.copyOf(arrivals);
		}

		/** True when the first pickup is before {@link #EARLIEST_FIRST_PICKUP}, or the day before. */
		public boolean startsTooEarly() {
			return crossesMidnight || (!arrivals.isEmpty() && arrivals.get(0).isBefore(EARLIEST_FIRST_PICKUP));
		}
	}

	/**
	 * Times for stops already in visiting order. The caller passes only stops that have a pin
	 * (the contract skips the others), and this asks {@code travelTimes} for one matrix.
	 */
	public static Timing schedule(TravelTimes travelTimes, List<Coordinate> orderedPins, Coordinate school,
			LocalTime schoolArrival) {
		List<Coordinate> points = new ArrayList<>(orderedPins);
		points.add(school);
		int[] order = new int[orderedPins.size()];
		for (int i = 0; i < order.length; i++) {
			order[i] = i;
		}
		return schedule(travelTimes.matrix(points), order, orderedPins.size(), schoolArrival);
	}

	/**
	 * Times for a visiting {@code order} of matrix indices, for a caller that already holds the
	 * matrix (the solver). {@code school} is the matrix index of the school, the end of the path.
	 */
	public static Timing schedule(Duration[][] matrix, int[] order, int school, LocalTime schoolArrival) {
		int n = order.length;
		long[] minutes = new long[n];
		long clock = schoolArrival.getHour() * 60L + schoolArrival.getMinute();
		long driving = 0;
		int next = school;
		for (int i = n - 1; i >= 0; i--) {
			long leg = matrix[order[i]][next].toMinutes();
			driving += leg;
			clock -= leg;
			minutes[i] = clock;
			next = order[i];
		}
		Duration drivingTime = Duration.ofMinutes(driving);
		if (n > 0 && minutes[0] < 0) {
			return new Timing(List.of(), drivingTime, true);
		}
		List<LocalTime> arrivals = new ArrayList<>(n);
		for (long m : minutes) {
			arrivals.add(LocalTime.of((int) (m / 60), (int) (m % 60)));
		}
		return new Timing(arrivals, drivingTime, false);
	}
}
