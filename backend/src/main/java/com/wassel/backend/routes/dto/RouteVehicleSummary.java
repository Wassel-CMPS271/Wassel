package com.wassel.backend.routes.dto;

import java.util.UUID;

public record RouteVehicleSummary(UUID id, String plateNumber, int capacity) {
}
