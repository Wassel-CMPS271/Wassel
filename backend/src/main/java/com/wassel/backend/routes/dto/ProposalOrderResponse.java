package com.wassel.backend.routes.dto;

import java.util.List;

/** One order for the side-by-side view: its stops with arrival times, and the minutes from the first pickup to the school. */
public record ProposalOrderResponse(long drivingMinutes, List<StopResponse> stops) {
}
