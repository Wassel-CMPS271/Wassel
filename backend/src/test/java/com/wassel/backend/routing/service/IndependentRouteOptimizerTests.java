package com.wassel.backend.routing.service;

import com.wassel.backend.routing.config.OpenRouteServiceProperties;
import com.wassel.backend.routing.service.RouteOptimizer.Code;
import com.wassel.backend.routing.service.RouteOptimizer.Plan;
import com.wassel.backend.routing.service.RouteOptimizer.PlannedStop;
import com.wassel.backend.routing.service.RouteOptimizer.Stop;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

/** SCRUM-228: contract assertions, with an arrival/cost oracle independent of RouteTimings. */
class IndependentRouteOptimizerTests {

	private static final Coordinate SCHOOL = new Coordinate(33.896, 35.484);
	private static final LocalTime DEADLINE = LocalTime.of(8, 0);
	private static final LocalTime EARLIEST = LocalTime.of(6, 0);

	// Directed whole-minute costs: eastbound is slower. Neither solver order nor wall-clock
	// search duration is an expected value; the oracle checks the legs of whichever order wins.
	private static long minutes(Coordinate from, Coordinate to) {
		long north = Math.round(Math.abs(from.latitude() - to.latitude()) * 1000);
		long east = Math.round(Math.abs(from.longitude() - to.longitude()) * 1000);
		return north + east * (to.longitude() > from.longitude() ? 2 : 1);
	}

	private static final TravelTimes DIRECTED = points -> {
		Duration[][] matrix = new Duration[points.size()][points.size()];
		for (int i = 0; i < points.size(); i++) {
			for (int j = 0; j < points.size(); j++) {
				matrix[i][j] = Duration.ofMinutes(minutes(points.get(i), points.get(j)));
			}
		}
		return matrix;
	};

	private static List<Stop> stops(int count) {
		return IntStream.rangeClosed(1, count).mapToObj(i -> new Stop(new UUID(228, i),
				new Coordinate(33.880 + (i * 7 % 15) * 0.001, 35.480 + (i * 3 % 7) * 0.001))).toList();
	}

	private static List<UUID> ids(List<Stop> stops) {
		return stops.stream().map(Stop::studentId).toList();
	}

	private static void assertRejected(Plan plan, Code code) {
		assertFalse(plan.feasible());
		assertEquals(List.of(code), plan.reasons().stream().map(RouteOptimizer.Reason::code).toList());
		assertFalse(plan.reasons().getFirst().message().isBlank());
		assertTrue(plan.stops().isEmpty(), "an infeasible plan must not silently keep a subset");
		assertEquals(Duration.ZERO, plan.totalDrivingTime());
	}

	// Forward simulation: each pickup must be exactly one leg after the previous one;
	// arriving at school must match the requested deadline. Never call RouteTimings here.
	private static void assertSchedule(Plan plan, List<Stop> input, int capacity,
			LocalTime deadline, TravelTimes times) {
		assertTrue(plan.feasible(), () -> "unexpected infeasibility: " + plan.reasons());
		assertTrue(plan.reasons().isEmpty());
		List<UUID> actualIds = plan.stops().stream().map(PlannedStop::studentId).toList();
		assertEquals(input.size(), actualIds.size(), "every student must be retained");
		assertEquals(ids(input).stream().sorted().toList(), actualIds.stream().sorted().toList());
		assertEquals(input.size(), actualIds.stream().distinct().count(), "no duplicate students");
		assertTrue(actualIds.size() <= capacity, "capacity never exceeded");
		Map<UUID, Coordinate> locations = new HashMap<>();
		input.forEach(stop -> locations.put(stop.studentId(), stop.location()));
		List<Coordinate> points = new ArrayList<>(actualIds.stream().map(locations::get).toList());
		points.add(SCHOOL);
		Duration[][] legs = times.matrix(points);
		long total = 0;
		long clock = plan.stops().getFirst().arrivalTime().toSecondOfDay() / 60;
		assertTrue(clock >= EARLIEST.toSecondOfDay() / 60, "first pickup cannot be before 06:00");
		for (int i = 0; i < input.size(); i++) {
			assertEquals(clock, plan.stops().get(i).arrivalTime().toSecondOfDay() / 60,
					"pickup clock must agree with the preceding directed leg at position " + (i + 1));
			assertFalse(plan.stops().get(i).arrivalTime().isAfter(deadline));
			long leg = legs[i][i + 1].toMinutes();
			total += leg;
			clock += leg;
		}
		assertEquals(deadline.toSecondOfDay() / 60, clock, "last leg reaches school on time without wrapping midnight");
		assertEquals(Duration.ofMinutes(total), plan.totalDrivingTime());
	}

	@ParameterizedTest(name = "SOL-01/02: {0} students, 14 seats")
	@ValueSource(ints = { 10, 14 })
	void capacityExamplesPreserveAllStudentsAndReachSchool(int count) {
		List<Stop> input = stops(count);
		List<Stop> before = List.copyOf(input);
		Plan plan = new OrToolsRouteOptimizer(DIRECTED).optimize(input, SCHOOL, 14, DEADLINE);
		assertSchedule(plan, input, 14, DEADLINE, DIRECTED);
		assertEquals(before, input, "optimizing cannot mutate the caller's saved order");
		long manualCost = 0;
		for (int i = 0; i < input.size(); i++) {
			manualCost += minutes(input.get(i).location(), i + 1 < input.size() ? input.get(i + 1).location() : SCHOOL);
		}
		assertTrue(plan.totalDrivingTime().toMinutes() <= manualCost, "never worse than the manual order");
	}

	@Test
	void sol03FifteenStudentsCannotFitFourteenSeatsEvenIfTimeAlsoFails() {
		TravelTimes mustNotSearch = points -> { throw new AssertionError("capacity must be checked before travel times"); };
		Plan plan = new OrToolsRouteOptimizer(mustNotSearch).optimize(stops(15), SCHOOL, 14, LocalTime.of(0, 1));
		assertRejected(plan, Code.CAPACITY_EXCEEDED);
	}

	@Test
	void sol04EmptyDirectInputIsSafeWhileTheApiRejectsAnEmptyRoute() {
		Plan plan = new OrToolsRouteOptimizer(DIRECTED).optimize(List.of(), SCHOOL, 14, DEADLINE);
		assertTrue(plan.feasible());
		assertTrue(plan.stops().isEmpty());
		assertTrue(plan.reasons().isEmpty());
		assertEquals(Duration.ZERO, plan.totalDrivingTime());
	}

	@Test
	void sol05SingleStudentHasOnlyItsOwnLegToSchool() {
		List<Stop> input = List.of(new Stop(new UUID(228, 1), new Coordinate(33.891, 35.484)));
		Plan plan = new OrToolsRouteOptimizer(DIRECTED).optimize(input, SCHOOL, 1, DEADLINE);
		assertSchedule(plan, input, 1, DEADLINE, DIRECTED);
		assertEquals(Duration.ofMinutes(5), plan.totalDrivingTime());
		assertEquals(LocalTime.of(7, 55), plan.stops().getFirst().arrivalTime());
	}

	@Test
	void sol06CoLocatedSiblingsKeepSeparateSeatsAndZeroMinuteLegs() {
		Coordinate shared = new Coordinate(33.891, 35.484);
		List<Stop> input = IntStream.rangeClosed(1, 3).mapToObj(i -> new Stop(new UUID(228, i), shared)).toList();
		Plan plan = new OrToolsRouteOptimizer(DIRECTED).optimize(input, SCHOOL, 3, DEADLINE);
		assertSchedule(plan, input, 3, DEADLINE, DIRECTED);
		assertEquals(List.of(LocalTime.of(7, 55), LocalTime.of(7, 55), LocalTime.of(7, 55)),
				plan.stops().stream().map(PlannedStop::arrivalTime).toList());
		assertRejected(new OrToolsRouteOptimizer(DIRECTED).optimize(input, SCHOOL, 2, DEADLINE), Code.CAPACITY_EXCEEDED);
	}

	@Test
	void sol07ProviderFailureUsesTheRealFallbackBeforeReachingTheSolver() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo("https://ors.test/v2/matrix/driving-car"))
				.andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
		StraightLineTravelTimes fallback = new StraightLineTravelTimes();
		TravelTimes provider = new OpenRouteServiceTravelTimes(builder,
				new OpenRouteServiceProperties("https://ors.test", "scrum228-test-key", null), fallback);
		List<Stop> input = stops(4);
		Plan plan = new OrToolsRouteOptimizer(provider).optimize(input, SCHOOL, 4, DEADLINE);
		assertSchedule(plan, input, 4, DEADLINE, fallback);
		server.verify();
	}

	@ParameterizedTest(name = "SOL-08: {0} driving minutes, feasible={1}")
	@CsvSource({ "120,true", "121,false", "481,false" })
	void sol08EarliestPickupIsInclusiveAndImpossibleTripsDoNotWrapMidnight(long minutes, boolean feasible) {
		TravelTimes fixed = points -> new Duration[][] {
				{ Duration.ZERO, Duration.ofMinutes(minutes) }, { Duration.ofMinutes(minutes), Duration.ZERO } };
		List<Stop> input = stops(1);
		Plan plan = new OrToolsRouteOptimizer(fixed).optimize(input, SCHOOL, 1, DEADLINE);
		if (feasible) {
			assertSchedule(plan, input, 1, DEADLINE, fixed);
			assertEquals(EARLIEST, plan.stops().getFirst().arrivalTime());
		} else {
			assertRejected(plan, Code.ARRIVAL_TIME_UNREACHABLE);
		}
	}

	@Test
	void invalidOrMissingPinsAreRejectedAtTheContractBoundary() {
		assertThrows(NullPointerException.class, () -> new Stop(new UUID(228, 1), null));
		assertThrows(IllegalArgumentException.class, () -> new Coordinate(91, 35));
		assertThrows(IllegalArgumentException.class, () -> new Coordinate(33, -181));
		assertThrows(IllegalArgumentException.class, () -> new Coordinate(Double.NaN, 35));
	}
}
