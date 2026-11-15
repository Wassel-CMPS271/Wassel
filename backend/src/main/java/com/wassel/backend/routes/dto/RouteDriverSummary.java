package com.wassel.backend.routes.dto;

import com.wassel.backend.drivers.dto.DriverResponse;

import java.util.UUID;

public record RouteDriverSummary(UUID id, String firstName, String lastName) {

	public static RouteDriverSummary of(DriverResponse driver) {
		return new RouteDriverSummary(driver.id(), driver.firstName(), driver.lastName());
	}
}
