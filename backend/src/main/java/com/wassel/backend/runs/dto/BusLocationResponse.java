package com.wassel.backend.runs.dto;

/** What a parent may draw for a child's bus. {@code position} is set exactly when the status is not UNAVAILABLE. */
public record BusLocationResponse(LocationStatus status, BusPositionResponse position) {

	public static final BusLocationResponse UNAVAILABLE = new BusLocationResponse(LocationStatus.UNAVAILABLE, null);
}
