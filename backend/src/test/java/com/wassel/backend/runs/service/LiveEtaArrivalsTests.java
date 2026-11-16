package com.wassel.backend.runs.service;

import com.wassel.backend.routes.dto.StopResponse;
import com.wassel.backend.routing.service.StraightLineTravelTimes;
import com.wassel.backend.runs.dto.BusPositionResponse;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * SCRUM-268: the arrival at every stop of the chain, with the numbers worked out by hand. All stops sit on one meridian,
 * so a leg is a difference of latitudes: 0.01 degree is 2.22 minutes (3 rounded up), 0.02 is 4.45 (5), 0.03 is 6.67 (7).
 */
class LiveEtaArrivalsTests {

	private static final Instant FIX = Instant.parse("2026-11-04T05:00:00Z");

	private static final StraightLineTravelTimes TRAVEL = new StraightLineTravelTimes();

	private static StopResponse stop(Double latitude) {
		return new StopResponse(UUID.randomUUID(), 1, "A", "B", "Street",
				latitude == null ? null : BigDecimal.valueOf(latitude), latitude == null ? null : BigDecimal.valueOf(35.5),
				null);
	}

	private static BusPositionResponse bus(double latitude) {
		return new BusPositionResponse(latitude, 35.5, 5, FIX, 0);
	}

	@Test
	void eachStopArrivesAfterTheLegsBeforeIt() {
		List<StopResponse> toDo = List.of(stop(33.90), stop(33.91), stop(33.93));

		List<Instant> arrivals = LiveEta.arrivals(TRAVEL, bus(33.89), toDo, FIX);

		assertEquals(List.of(FIX.plusSeconds(3 * 60), FIX.plusSeconds(6 * 60), FIX.plusSeconds(11 * 60)), arrivals,
				"3, then 3 more, then 5 more (0.02 degree)");
	}

	@Test
	void aStopWithoutAPinHasNoArrivalAndAddsNoLeg() {
		List<StopResponse> toDo = Arrays.asList(stop(33.90), stop(null), stop(33.93));

		List<Instant> arrivals = LiveEta.arrivals(TRAVEL, bus(33.89), toDo, FIX);

		assertEquals(FIX.plusSeconds(3 * 60), arrivals.get(0));
		assertNull(arrivals.get(1));
		assertEquals(FIX.plusSeconds(10 * 60), arrivals.get(2), "3 to the first, then 7 straight to the third");
	}

	@Test
	void noArrivalIsEarlierThanNow() {
		List<StopResponse> toDo = List.of(stop(33.90), stop(33.91));
		Instant now = FIX.plusSeconds(4 * 60);

		assertEquals(List.of(now, FIX.plusSeconds(6 * 60)), LiveEta.arrivals(TRAVEL, bus(33.89), toDo, now),
				"the first was due at 3 minutes, but it is 4 minutes after the fix and the child is still waiting");
	}

	@Test
	void theEstimateOfAStopIsItsEntryOfTheChain() {
		List<StopResponse> toDo = List.of(stop(33.90), stop(33.91), stop(33.93));

		assertEquals(FIX.plusSeconds(11 * 60), LiveEta.estimate(TRAVEL, bus(33.89), toDo, FIX).arrivesAt());
		assertEquals(11 * 60, LiveEta.estimate(TRAVEL, bus(33.89), toDo, FIX).secondsAway());
		assertNull(LiveEta.estimate(TRAVEL, bus(33.89), List.of(stop(33.90), stop(null)), FIX), "the target has no pin");
		assertNull(LiveEta.estimate(TRAVEL, bus(33.89), List.of(), FIX), "nothing to do");
	}
}
