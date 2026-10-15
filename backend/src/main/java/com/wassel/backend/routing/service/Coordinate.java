package com.wassel.backend.routing.service;

/**
 * A point on the map in degrees. Out-of-range values (and NaN) are rejected here so no caller
 * has to re-check them.
 */
public record Coordinate(double latitude, double longitude) {

	public Coordinate {
		if (!(latitude >= -90 && latitude <= 90)) {
			throw new IllegalArgumentException("latitude must be between -90 and 90");
		}
		if (!(longitude >= -180 && longitude <= 180)) {
			throw new IllegalArgumentException("longitude must be between -180 and 180");
		}
	}
}
