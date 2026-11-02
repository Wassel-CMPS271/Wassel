package com.wassel.backend.vehicles.service;

import java.util.UUID;

/**
 * What the vehicles module asks before it lowers a vehicle's seats (SCRUM-241): how many students
 * are on the route this vehicle is assigned to right now. Declared here and implemented by the
 * routes module, so {@code vehicles} never imports {@code routes} — which already imports
 * {@code vehicles} for the reverse check (a route's vehicle must be active), and both importing
 * each other would be a cycle.
 */
public interface VehicleOccupancyGuard {

	/** Students on the route this vehicle is on now, or 0 if it is not on one. */
	long studentCountOnVehiclesRoute(UUID schoolId, UUID vehicleId);
}
