package com.wassel.backend.routing.service;

import com.wassel.backend.routing.service.RouteTimings.Timing;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RouteTimingsTests {

	// The school and the Hamra morning run from docs/contracts/samples/routing (proposal.json).
	private static final Coordinate SCHOOL = new Coordinate(33.896, 35.484);
	private static final LocalTime SCHOOL_ARRIVAL = LocalTime.of(7, 30);
	private static final Coordinate RAMI = new Coordinate(33.8995, 35.521);
	private static final Coordinate SALMA = new Coordinate(33.887, 35.488);
	private static final Coordinate TAREK = new Coordinate(33.905, 35.51);
	private static final Coordinate DANA = new Coordinate(33.891, 35.48);

	private final TravelTimes straightLine = new StraightLineTravelTimes();

	@Test
	void theCurrentOrderMatchesTheContractSample() {
		Timing timing = RouteTimings.schedule(straightLine, List.of(RAMI, SALMA, TAREK, DANA), SCHOOL, SCHOOL_ARRIVAL);

		assertEquals(List.of(LocalTime.of(7, 8), LocalTime.of(7, 15), LocalTime.of(7, 21), LocalTime.of(7, 28)),
				timing.arrivals());
		assertEquals(Duration.ofMinutes(22), timing.drivingTime());
	}

	@Test
	void theProposedOrderMatchesTheContractSample() {
		Timing timing = RouteTimings.schedule(straightLine, List.of(RAMI, TAREK, SALMA, DANA), SCHOOL, SCHOOL_ARRIVAL);

		assertEquals(List.of(LocalTime.of(7, 17), LocalTime.of(7, 20), LocalTime.of(7, 26), LocalTime.of(7, 28)),
				timing.arrivals());
		assertEquals(Duration.ofMinutes(13), timing.drivingTime());
	}

	@Test
	void theLastStopArrivesBeforeTheSchoolByItsLeg() {
		Timing timing = RouteTimings.schedule(straightLine, List.of(DANA), SCHOOL, SCHOOL_ARRIVAL);

		assertEquals(List.of(LocalTime.of(7, 28)), timing.arrivals());
		assertEquals(Duration.ofMinutes(2), timing.drivingTime());
	}

	@Test
	void anEmptyRouteHasNoTimes() {
		Timing timing = RouteTimings.schedule(straightLine, List.of(), SCHOOL, SCHOOL_ARRIVAL);

		assertEquals(List.of(), timing.arrivals());
		assertEquals(Duration.ZERO, timing.drivingTime());
		assertFalse(timing.startsTooEarly());
	}

	// stop 0 -> stop 1 takes 10 min, stop 1 -> school takes 20 min (matrix index 2 is the school)
	private static Timing hand(LocalTime schoolArrival) {
		Duration[][] m = new Duration[3][3];
		for (Duration[] row : m) {
			Arrays.fill(row, Duration.ZERO);
		}
		m[0][1] = Duration.ofMinutes(10);
		m[1][2] = Duration.ofMinutes(20);
		return RouteTimings.schedule(m, new int[] { 0, 1 }, 2, schoolArrival);
	}

	@Test
	void timesAreWorkedBackwardsFromTheSchoolArrival() {
		Timing timing = hand(LocalTime.of(7, 30));

		assertEquals(List.of(LocalTime.of(7, 0), LocalTime.of(7, 10)), timing.arrivals());
		assertEquals(Duration.ofMinutes(30), timing.drivingTime());
	}

	@Test
	void aFirstPickupExactlyAtTheEarliestTimeIsAllowed() {
		assertFalse(hand(LocalTime.of(6, 30)).startsTooEarly());
	}

	@Test
	void aFirstPickupOneMinuteBeforeTheEarliestTimeIsTooEarly() {
		Timing timing = hand(LocalTime.of(6, 29));

		assertEquals(LocalTime.of(5, 59), timing.arrivals().get(0));
		assertTrue(timing.startsTooEarly());
		assertFalse(timing.crossesMidnight());
	}

	@Test
	void aFirstPickupBeforeMidnightIsFlaggedNotWrapped() {
		Timing timing = hand(LocalTime.of(0, 20));

		assertTrue(timing.crossesMidnight());
		assertTrue(timing.startsTooEarly());
		assertEquals(List.of(), timing.arrivals());
		assertEquals(Duration.ofMinutes(30), timing.drivingTime());
	}
}
