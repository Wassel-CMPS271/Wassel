package com.wassel.backend.routing.service;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;

/**
 * Stand-in {@link TravelTimes}: great-circle distance at a fixed 30 km/h, rounded up to whole
 * minutes. It lets the solver and the arrival times work before the road provider exists, and it
 * is the fallback when that provider fails. The speed and the rounding are part of the routing
 * contract, because sample arrival times and tests depend on them.
 */
@Component
public class StraightLineTravelTimes implements TravelTimes {

	static final double SPEED_KM_PER_HOUR = 30;

	private static final double EARTH_RADIUS_KM = 6371.0088;

	@Override
	public Duration[][] matrix(List<Coordinate> points) {
		int n = points.size();
		Duration[][] matrix = new Duration[n][n];
		for (int i = 0; i < n; i++) {
			for (int j = 0; j < n; j++) {
				matrix[i][j] = between(points.get(i), points.get(j));
			}
		}
		return matrix;
	}

	private static Duration between(Coordinate from, Coordinate to) {
		double minutes = distanceKm(from, to) / SPEED_KM_PER_HOUR * 60;
		return Duration.ofMinutes((long) Math.ceil(minutes));
	}

	private static double distanceKm(Coordinate from, Coordinate to) {
		double lat1 = Math.toRadians(from.latitude());
		double lat2 = Math.toRadians(to.latitude());
		double dLat = lat2 - lat1;
		double dLon = Math.toRadians(to.longitude() - from.longitude());
		double a = Math.pow(Math.sin(dLat / 2), 2)
				+ Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2);
		return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
	}
}
