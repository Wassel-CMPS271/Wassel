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
		if (toDo.isEmpty()) {
			return null;
		}
		Instant arrival = arrivals(travelTimes, fix, toDo, now).getLast();
		return arrival == null ? null : new EstimateResponse(arrival, Duration.between(now, arrival).toSeconds());
	}

	/**
	 * The arrival at every stop of {@code toDo}, in its order (SCRUM-268 needs them all): the same chain as
	 * {@link #estimate}, whose answer for a stop is this list's entry for it. Null for a stop without a pin; each other
	 * arrival is the fix's receive time plus the legs up to it, never earlier than {@code now}.
	 */
	static List<Instant> arrivals(StraightLineTravelTimes travelTimes, BusPositionResponse fix, List<StopResponse> toDo,
			Instant now) {
		List<Coordinate> path = new ArrayList<>();
		path.add(new Coordinate(fix.latitude(), fix.longitude()));
		toDo.stream().filter(LiveEta::hasPin).forEach(stop -> path.add(
				new Coordinate(stop.latitude().doubleValue(), stop.longitude().doubleValue())));
		Duration[][] legs = travelTimes.matrix(path);
		List<Instant> arrivals = new ArrayList<>();
		Duration travel = Duration.ZERO;
		int at = 0;
		for (StopResponse stop : toDo) {
			if (!hasPin(stop)) {
				arrivals.add(null);
				continue;
			}
			travel = travel.plus(legs[at][at + 1]);
			at++;
			Instant arrival = fix.receivedAt().plus(travel);
			arrivals.add(arrival.isBefore(now) ? now : arrival);
		}
		return arrivals;
	}

	private static boolean hasPin(StopResponse stop) {
		return stop.latitude() != null && stop.longitude() != null;
	}
}
