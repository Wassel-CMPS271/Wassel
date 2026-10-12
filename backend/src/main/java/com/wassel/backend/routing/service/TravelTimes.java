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
	 * assumed to be symmetric. An implementation that cannot reach its source falls back to an
	 * estimate itself, so callers never see a failure here.
	 */
	Duration[][] matrix(List<Coordinate> points);
}
