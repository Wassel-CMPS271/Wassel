package com.wassel.backend.routing.service;

import java.time.Duration;
import java.util.List;

/**
 * Driving times between points. One matrix per call, not one call per pair, because the road
 * provider (SCRUM-204) is rate limited and a 30-stop route would otherwise need about 900 calls.
 */
public interface TravelTimes {

	/**
	 * {@code [i][j]} is the time from {@code points.get(i)} to {@code points.get(j)}, in input
	 * order. The matrix is square, never contains null, and {@code [i][i]} is zero. It is not
	 * assumed to be symmetric.
	 *
	 * <p>Every entry is a whole number of minutes, rounded up, because the contract's arrival
	 * times and driving totals are whole minutes and must add up the same wherever they are
	 * computed. An implementation that gets seconds from its source rounds them itself.
	 *
	 * <p>An implementation must not throw for valid points: if its source fails, it catches that
	 * and estimates, so callers never see the failure. Each call returns a fresh array, so a
	 * caller may change it and an implementation may cache without copying defensively.
	 */
	Duration[][] matrix(List<Coordinate> points);
}
