package com.wassel.backend.routing.service;

import com.wassel.backend.routing.service.RouteOptimizer.Code;
import com.wassel.backend.routing.service.RouteOptimizer.PlannedStop;
import com.wassel.backend.routing.service.RouteOptimizer.Plan;
import com.wassel.backend.routing.service.RouteOptimizer.Stop;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTimeout;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OrToolsRouteOptimizerTests {

	// The school and the Hamra morning run from docs/contracts/samples/routing (proposal.json).
	private static final Coordinate SCHOOL = new Coordinate(33.896, 35.484);
	private static final LocalTime SCHOOL_ARRIVAL = LocalTime.of(7, 30);
	private static final List<Coordinate> HAMRA = List.of(
			new Coordinate(33.8995, 35.521), // Rami
			new Coordinate(33.887, 35.488), // Salma
			new Coordinate(33.905, 35.51), // Tarek
			new Coordinate(33.891, 35.48)); // Dana

	private final TravelTimes straightLine = new StraightLineTravelTimes();
	private final RouteOptimizer optimizer = new OrToolsRouteOptimizer(straightLine);

	// Going up in latitude takes 1 minute and going down takes 10, so the best order is ascending
	// latitude. Straight-line times are symmetric and cannot tell a solver that reads legs backwards.
	private static final Coordinate HIGH_SCHOOL = new Coordinate(34.0, 35.484);
	private static final TravelTimes ONE_WAY = points -> {
		int n = points.size();
		Duration[][] m = new Duration[n][n];
		for (int i = 0; i < n; i++) {
			for (int j = 0; j < n; j++) {
				m[i][j] = i == j ? Duration.ZERO
						: Duration.ofMinutes(points.get(j).latitude() > points.get(i).latitude() ? 1 : 10);
			}
		}
		return m;
	};

	private static List<Stop> stopsAt(List<Coordinate> locations) {
		return locations.stream().map(c -> new Stop(UUID.randomUUID(), c)).toList();
	}

	private static List<Coordinate> randomPins(int count, long seed) {
		Random random = new Random(seed);
		List<Coordinate> pins = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			// About 3 km by 4 km: a random order of a dozen stops is still a drivable morning run.
			pins.add(new Coordinate(33.88 + random.nextDouble() * 0.03, 35.47 + random.nextDouble() * 0.04));
		}
		return pins;
	}

	/** Whole minutes first pickup to school, by the same rule the optimizer uses. */
	private long driving(List<Coordinate> inOrder) {
		return RouteTimings.schedule(straightLine, inOrder, SCHOOL, SCHOOL_ARRIVAL).drivingTime().toMinutes();
	}

	/** An undrivable given order would let "never worse" pass at zero minutes (an infeasible plan has 0). */
	private void assertDrivable(List<Coordinate> inOrder) {
		assertFalse(RouteTimings.schedule(straightLine, inOrder, SCHOOL, SCHOOL_ARRIVAL).startsTooEarly(),
				"the fixture's given order must itself be a drivable route");
	}

	private static List<Stop> stopsOnALine(int count, long seed) {
		Random random = new Random(seed);
		List<Stop> stops = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			stops.add(new Stop(UUID.randomUUID(), new Coordinate(33.80 + random.nextDouble() * 0.10, 35.5)));
		}
		return stops;
	}

	private static List<Coordinate> locationsInPlanOrder(Plan plan, List<Stop> stops) {
		return plan.stops().stream()
				.map(p -> stops.stream().filter(s -> s.studentId().equals(p.studentId())).findFirst().orElseThrow()
						.location())
				.toList();
	}

	@Test
	void aFullVehicleIsFeasible() {
		List<Stop> stops = stopsAt(HAMRA);

		Plan plan = optimizer.optimize(stops, SCHOOL, 4, SCHOOL_ARRIVAL);

		assertTrue(plan.feasible());
		assertEquals(4, plan.stops().size());
	}

	@Test
	void oneStudentOverCapacityIsNotFeasibleAndNobodyIsDropped() {
		Plan plan = optimizer.optimize(stopsAt(HAMRA), SCHOOL, 3, SCHOOL_ARRIVAL);

		assertFalse(plan.feasible());
		assertEquals(Code.CAPACITY_EXCEEDED, plan.reasons().get(0).code());
		assertTrue(plan.stops().isEmpty());
		assertEquals(Duration.ZERO, plan.totalDrivingTime());
	}

	@Test
	void capacityIsReportedEvenWhenTheTimeWouldAlsoFail() {
		Plan plan = optimizer.optimize(stopsAt(HAMRA), SCHOOL, 3, LocalTime.of(0, 5));

		assertEquals(1, plan.reasons().size());
		assertEquals(Code.CAPACITY_EXCEEDED, plan.reasons().get(0).code());
	}

	@Test
	void everyStudentAppearsExactlyOnce() {
		List<Stop> stops = stopsAt(randomPins(30, 7));

		Plan plan = optimizer.optimize(stops, SCHOOL, 30, SCHOOL_ARRIVAL);

		Set<UUID> expected = new HashSet<>();
		stops.forEach(s -> expected.add(s.studentId()));
		List<UUID> planned = plan.stops().stream().map(PlannedStop::studentId).toList();
		assertEquals(30, planned.size());
		assertEquals(expected, new HashSet<>(planned));
		// 90 minutes separate the school time from the 06:00 limit; a slow machine must not eat them.
		assertTrue(plan.totalDrivingTime().toMinutes() <= 70, "keeps 20 minutes of margin to the 06:00 limit");
	}

	@Test
	void anOrderIsNeverWorseThanTheGivenOne() {
		for (long seed = 1; seed <= 5; seed++) {
			List<Stop> stops = stopsAt(randomPins(12, seed));
			List<Coordinate> given = stops.stream().map(Stop::location).toList();
			assertDrivable(given);

			Plan plan = optimizer.optimize(stops, SCHOOL, 12, SCHOOL_ARRIVAL);

			assertTrue(plan.feasible(), "seed " + seed);
			assertTrue(plan.totalDrivingTime().toMinutes() <= driving(given), "seed " + seed);
		}
	}

	@Test
	void theContractSampleRouteImproves() {
		Plan plan = optimizer.optimize(stopsAt(HAMRA), SCHOOL, 14, SCHOOL_ARRIVAL);

		assertTrue(plan.feasible());
		assertTrue(plan.totalDrivingTime().toMinutes() <= 13, "contract sample proposes 13, current is 22");
	}

	@Test
	void smallRoutesFindTheBestOrder() {
		for (long seed = 1; seed <= 5; seed++) {
			List<Coordinate> pins = randomPins(6, seed);

			Plan plan = optimizer.optimize(stopsAt(pins), SCHOOL, 6, SCHOOL_ARRIVAL);

			assertEquals(bestByBruteForce(pins), plan.totalDrivingTime().toMinutes(), "seed " + seed);
		}
	}

	private long bestByBruteForce(List<Coordinate> pins) {
		return permute(new ArrayList<>(), new ArrayList<>(pins));
	}

	private long permute(List<Coordinate> chosen, List<Coordinate> left) {
		if (left.isEmpty()) {
			return driving(chosen);
		}
		long best = Long.MAX_VALUE;
		for (int i = 0; i < left.size(); i++) {
			List<Coordinate> nextLeft = new ArrayList<>(left);
			List<Coordinate> nextChosen = new ArrayList<>(chosen);
			nextChosen.add(nextLeft.remove(i));
			best = Math.min(best, permute(nextChosen, nextLeft));
		}
		return best;
	}

	@Test
	void thirtyStopsSolveInUnderFiveSeconds() {
		List<Stop> stops = stopsAt(randomPins(30, 42));

		assertTimeout(java.time.Duration.ofSeconds(5), () -> optimizer.optimize(stops, SCHOOL, 30, SCHOOL_ARRIVAL));
	}

	@Test
	void arrivalTimesFollowTheRuleAndNeverPassTheSchoolTime() {
		List<Stop> stops = stopsAt(randomPins(10, 3));

		Plan plan = optimizer.optimize(stops, SCHOOL, 10, SCHOOL_ARRIVAL);

		List<LocalTime> expected = RouteTimings
				.schedule(straightLine, locationsInPlanOrder(plan, stops), SCHOOL, SCHOOL_ARRIVAL).arrivals();
		assertEquals(expected, plan.stops().stream().map(PlannedStop::arrivalTime).toList());
		plan.stops().forEach(p -> assertFalse(p.arrivalTime().isAfter(SCHOOL_ARRIVAL)));
	}

	@Test
	void aFirstPickupBeforeTheEarliestTimeIsUnreachable() {
		Plan plan = optimizer.optimize(stopsAt(HAMRA), SCHOOL, 4, LocalTime.of(6, 5));

		assertFalse(plan.feasible());
		assertEquals(Code.ARRIVAL_TIME_UNREACHABLE, plan.reasons().get(0).code());
		assertTrue(plan.stops().isEmpty());
		assertEquals(Duration.ZERO, plan.totalDrivingTime());
	}

	@Test
	void aFirstPickupBeforeMidnightIsUnreachable() {
		Plan plan = optimizer.optimize(stopsAt(HAMRA), SCHOOL, 4, LocalTime.of(0, 5));

		assertFalse(plan.feasible());
		assertEquals(Code.ARRIVAL_TIME_UNREACHABLE, plan.reasons().get(0).code());
	}

	@Test
	void oneStopKeepsItsStudent() {
		List<Stop> stops = stopsAt(List.of(HAMRA.get(3)));

		Plan plan = optimizer.optimize(stops, SCHOOL, 1, SCHOOL_ARRIVAL);

		assertEquals(List.of(stops.get(0).studentId()), plan.stops().stream().map(PlannedStop::studentId).toList());
		assertEquals(Duration.ofMinutes(2), plan.totalDrivingTime());
	}

	@Test
	void studentsAtTheSameAddressAreTwoStops() {
		List<Stop> stops = stopsAt(List.of(HAMRA.get(0), HAMRA.get(0), HAMRA.get(3)));

		Plan plan = optimizer.optimize(stops, SCHOOL, 3, SCHOOL_ARRIVAL);

		assertEquals(3, plan.stops().stream().map(PlannedStop::studentId).distinct().count());
	}

	@Test
	void aVisitingOrderMustUseEveryStopExactlyOnce() {
		assertTrue(OrToolsRouteOptimizer.isPermutation(new int[] { 2, 0, 1 }, 3));
		assertFalse(OrToolsRouteOptimizer.isPermutation(new int[] { 0, 0, 1 }, 3), "a stop twice");
		assertFalse(OrToolsRouteOptimizer.isPermutation(new int[] { 0, 1 }, 3), "a stop missing");
		assertFalse(OrToolsRouteOptimizer.isPermutation(new int[] { 0, 1, 3 }, 3), "an index past the end");
		assertFalse(OrToolsRouteOptimizer.isPermutation(new int[] { 0, 1, -1 }, 3), "a negative index");
		assertTrue(OrToolsRouteOptimizer.isPermutation(new int[] {}, 0));
	}

	@Test
	void oneWayTravelTimesAreHonoured() {
		List<Stop> stops = stopsOnALine(8, 11);

		Plan plan = new OrToolsRouteOptimizer(ONE_WAY).optimize(stops, HIGH_SCHOOL, 8, SCHOOL_ARRIVAL);

		assertEquals(Duration.ofMinutes(8), plan.totalDrivingTime());
	}

	@Test
	void anOrderThatIsAlreadyTheBestIsKept() {
		List<Stop> ascending = stopsOnALine(8, 11).stream()
				.sorted(Comparator.comparingDouble(s -> s.location().latitude())).toList();

		Plan plan = new OrToolsRouteOptimizer(ONE_WAY).optimize(ascending, HIGH_SCHOOL, 8, SCHOOL_ARRIVAL);

		assertEquals(ascending.stream().map(Stop::studentId).toList(),
				plan.stops().stream().map(PlannedStop::studentId).toList());
		assertEquals(Duration.ofMinutes(8), plan.totalDrivingTime());
	}

	@Test
	void anEmptyRouteIsFeasibleWithNoStops() {
		// The propose endpoint answers 409 for an empty route before it ever gets here.
		Plan plan = optimizer.optimize(List.of(), SCHOOL, 5, SCHOOL_ARRIVAL);

		assertTrue(plan.feasible());
		assertTrue(plan.stops().isEmpty());
		assertEquals(Duration.ZERO, plan.totalDrivingTime());
	}

	@Test
	void theTravelTimeSourceIsAskedOncePerRoute() {
		AtomicInteger calls = new AtomicInteger();
		TravelTimes counting = points -> {
			calls.incrementAndGet();
			return straightLine.matrix(points);
		};

		new OrToolsRouteOptimizer(counting).optimize(stopsAt(randomPins(20, 9)), SCHOOL, 20, SCHOOL_ARRIVAL);

		assertEquals(1, calls.get());
	}
}
