package com.wassel.backend.runs.service;

import com.wassel.backend.routes.dto.StopResponse;
import com.wassel.backend.routing.service.Coordinate;
import com.wassel.backend.routing.service.StraightLineTravelTimes;
import com.wassel.backend.runs.dto.BusPositionResponse;
import com.wassel.backend.runs.dto.EstimateResponse;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * The live estimate (SCRUM-262, docs/contracts/runs.md "Live ETA and stop progress"): the bus's last fix, then each
 * stop still to do up to the target, one straight-line leg after another. The type is {@link StraightLineTravelTimes},
 * never the road provider: a moving bus is a new point every few seconds, and the provider's free quota is small.
 * shortcut: no road times and no time at stops, so it runs early; add them when a measured error says so.
 */
final class LiveEta {

	private LiveEta() {
	}

	/**
	 * {@code toDo} is the stops still to do in the run's order, ending with the target. Null when it is empty or the
	 * target has no pin (it cannot be placed); a stop without a pin before it adds no leg. The arrival is the fix's receive time plus the
	 * legs, never earlier than {@code now}, so {@code secondsAway} is never negative.
	 */
	static EstimateResponse estimate(StraightLineTravelTimes travelTimes, BusPositionResponse fix, List<StopResponse> toDo,
			Instant now) {
		if (toDo.isEmpty() || !hasPin(toDo.getLast())) {
			return null;
		}
		List<Coordinate> path = new ArrayList<>();
		path.add(new Coordinate(fix.latitude(), fix.longitude()));
		toDo.stream().filter(LiveEta::hasPin).forEach(stop -> path.add(
				new Coordinate(stop.latitude().doubleValue(), stop.longitude().doubleValue())));
		Duration[][] legs = travelTimes.matrix(path);
		Duration travel = Duration.ZERO;
		for (int i = 0; i + 1 < path.size(); i++) {
			travel = travel.plus(legs[i][i + 1]);
		}
		Instant arrival = fix.receivedAt().plus(travel);
		if (arrival.isBefore(now)) {
			arrival = now;
		}
		return new EstimateResponse(arrival, Duration.between(now, arrival).toSeconds());
	}

	private static boolean hasPin(StopResponse stop) {
		return stop.latitude() != null && stop.longitude() != null;
	}
}
