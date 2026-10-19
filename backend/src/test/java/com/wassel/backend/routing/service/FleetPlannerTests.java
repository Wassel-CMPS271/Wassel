package com.wassel.backend.routing.service;

import com.wassel.backend.routing.service.FleetPlanner.FleetPlan;
import com.wassel.backend.routing.service.FleetPlanner.Unplaced;
import com.wassel.backend.routing.service.FleetPlanner.Vehicle;
import com.wassel.backend.routing.service.FleetPlanner.VehicleRoute;
import com.wassel.backend.routing.service.RouteOptimizer.Code;
import com.wassel.backend.routing.service.RouteOptimizer.PlannedStop;
import com.wassel.backend.routing.service.RouteOptimizer.Stop;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeout;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The fleet planner's rules (SCRUM-206), checked on the real solver and the straight-line stand-in.
 * The search stops at a time limit, so these assert the rules every answer keeps, never one exact split.
 */
class FleetPlannerTests {

	private static final Coordinate SCHOOL = new Coordinate(33.896, 35.484);
	private static final LocalTime SCHOOL_ARRIVAL = LocalTime.of(7, 30);

	/** Degrees of latitude for about 20 km: 40 minutes at the stand-in's 30 km/h. */
	private static final double TWENTY_KM = 0.18;

	private final TravelTimes straightLine = new StraightLineTravelTimes();
	private final FleetPlanner planner = new FleetPlanner(straightLine, new OrToolsRouteOptimizer(straightLine));

	private static List<Stop> studentsAt(List<Coordinate> pins) {
		return pins.stream().map(pin -> new Stop(UUID.randomUUID(), pin)).toList();
	}

	/** About 3 km by 4 km around the school, like the single-route tests. */
	private static List<Coordinate> randomPins(int count, long seed) {
		Random random = new Random(seed);
		List<Coordinate> pins = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			pins.add(new Coordinate(33.88 + random.nextDouble() * 0.03, 35.47 + random.nextDouble() * 0.04));
		}
		return pins;
	}

	/** {@code count} pins within about 300 m of {@code centre}. */
	private static List<Coordinate> cluster(Coordinate centre, int count, long seed) {
		Random random = new Random(seed);
		return IntStream.range(0, count).mapToObj(i -> new Coordinate(centre.latitude() + random.nextDouble() * 0.003,
				centre.longitude() + random.nextDouble() * 0.003)).toList();
	}

	private static List<Vehicle> vehicles(int... capacities) {
		return IntStream.of(capacities).mapToObj(capacity -> new Vehicle(UUID.randomUUID(), capacity)).toList();
	}

	/** The demo fleet: 48 seats. */
	private static List<Vehicle> demoFleet() {
		return vehicles(14, 14, 20);
	}

	private static Coordinate north(double degrees) {
		return new Coordinate(SCHOOL.latitude() + degrees, SCHOOL.longitude());
	}

	private static Coordinate south(double degrees) {
		return new Coordinate(SCHOOL.latitude() - degrees, SCHOOL.longitude());
	}

	private static Set<UUID> placed(FleetPlan fleet) {
		Set<UUID> ids = new HashSet<>();
		fleet.routes().forEach(route -> route.plan().stops().forEach(stop -> ids.add(stop.studentId())));
		return ids;
	}

	private static List<Code> unplacedCodes(FleetPlan fleet) {
		return fleet.unplaced().stream().map(unplaced -> unplaced.reason().code()).toList();
	}

	/**
	 * The rules every answer keeps: each student exactly once, on a route or unplaced; each route on
	 * a vehicle that was given, at most once, within its seats, not empty, feasible and with its first
	 * pickup at or after 06:00; and arrival times that follow the contract's rule.
	 */
	private void assertKeepsTheRules(FleetPlan fleet, List<Stop> students, List<Vehicle> vehicles,
			LocalTime arrival) {
		Map<UUID, Coordinate> pins = new HashMap<>();
		students.forEach(student -> pins.put(student.studentId(), student.location()));
		Map<UUID, Integer> seats = new HashMap<>();
		vehicles.forEach(vehicle -> seats.put(vehicle.vehicleId(), vehicle.capacity()));

		List<UUID> seen = new ArrayList<>();
		Set<UUID> usedVehicles = new HashSet<>();
		for (VehicleRoute route : fleet.routes()) {
			assertTrue(seats.containsKey(route.vehicleId()), "a route is on a vehicle that was given");
			assertTrue(usedVehicles.add(route.vehicleId()), "a vehicle has at most one route");
			assertTrue(route.plan().feasible(), "every route is feasible");
			assertFalse(route.plan().stops().isEmpty(), "a vehicle with no students gets no route");
			assertTrue(route.plan().stops().size() <= seats.get(route.vehicleId()), "no vehicle over its seats");

			List<Coordinate> inOrder = route.plan().stops().stream().map(stop -> pins.get(stop.studentId())).toList();
			RouteTimings.Timing timing = RouteTimings.schedule(straightLine, inOrder, SCHOOL, arrival);
			assertEquals(timing.arrivals(), route.plan().stops().stream().map(PlannedStop::arrivalTime).toList(),
					"arrival times follow the contract's rule");
			assertEquals(timing.drivingTime(), route.plan().totalDrivingTime());
			assertFalse(timing.startsTooEarly(), "no first pickup before 06:00");
			route.plan().stops().forEach(stop -> seen.add(stop.studentId()));
		}
		fleet.unplaced().forEach(unplaced -> seen.add(unplaced.studentId()));

		assertEquals(students.size(), seen.size(), "no student appears twice");
		assertEquals(pins.keySet(), new HashSet<>(seen), "every student is placed or reported");

		Code expected = students.size() > seats.values().stream().mapToInt(Integer::intValue).sum()
				? Code.CAPACITY_EXCEEDED
				: Code.ARRIVAL_TIME_UNREACHABLE;
		boolean spareVehicle = vehicles.stream().anyMatch(v -> v.capacity() > 0 && !usedVehicles.contains(v.vehicleId()));
		long budget = arrival.toSecondOfDay() / 60 - RouteTimings.EARLIEST_FIRST_PICKUP.toSecondOfDay() / 60;
		for (Unplaced unplaced : fleet.unplaced()) {
			assertEquals(expected, unplaced.reason().code(), "capacity is the reason only when seats run short");
			if (spareVehicle) {
				long alone = straightLine.matrix(List.of(pins.get(unplaced.studentId()), SCHOOL))[0][1].toMinutes();
				assertTrue(alone > budget, "left out although a spare vehicle could take them alone");
			}
		}
	}

	@Test
	void everyStudentIsPlacedWhenThereAreEnoughSeats() {
		List<Stop> students = studentsAt(randomPins(40, 1));
		List<Vehicle> fleetVehicles = demoFleet();

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, students, fleetVehicles, SCHOOL_ARRIVAL);
		assertTrue(fleet.unplaced().isEmpty());
	}

	@Test
	void aFullFleetIsUsedToTheLastSeat() {
		List<Stop> students = studentsAt(randomPins(48, 2));
		List<Vehicle> fleetVehicles = demoFleet();

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, students, fleetVehicles, SCHOOL_ARRIVAL);
		assertEquals(48, placed(fleet).size());
	}

	@Test
	void moreStudentsThanSeatsFillsTheFleetAndReportsTheRestAsCapacity() {
		List<Stop> students = studentsAt(randomPins(52, 3));
		List<Vehicle> fleetVehicles = demoFleet();

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, students, fleetVehicles, SCHOOL_ARRIVAL);
		assertEquals(48, placed(fleet).size());
		assertEquals(List.of(Code.CAPACITY_EXCEEDED, Code.CAPACITY_EXCEEDED, Code.CAPACITY_EXCEEDED,
				Code.CAPACITY_EXCEEDED), unplacedCodes(fleet));
		String message = fleet.unplaced().get(0).reason().message();
		assertTrue(message.contains("52") && message.contains("48"), "the message gives both counts: " + message);
	}

	@Test
	void aStudentTooFarToReachInTimeIsReportedAndTheOthersArePlaced() {
		List<Coordinate> pins = new ArrayList<>(randomPins(5, 4));
		pins.add(north(3 * TWENTY_KM)); // 120 minutes away, and 07:30 leaves 90
		List<Stop> students = studentsAt(pins);
		List<Vehicle> fleetVehicles = vehicles(20);

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, students, fleetVehicles, SCHOOL_ARRIVAL);
		assertEquals(5, placed(fleet).size());
		assertEquals(1, fleet.unplaced().size());
		Unplaced far = fleet.unplaced().get(0);
		assertEquals(students.get(5).studentId(), far.studentId());
		assertEquals(Code.ARRIVAL_TIME_UNREACHABLE, far.reason().code());
	}

	@Test
	void studentsAreSplitWhenOneRouteWouldStartTooEarly() {
		// Each alone is 40 minutes; one route through both is 80 + 40 = 120, over the 90 that 07:30 leaves.
		List<Stop> students = studentsAt(List.of(north(TWENTY_KM), south(TWENTY_KM)));
		List<Vehicle> fleetVehicles = vehicles(20, 14);

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, students, fleetVehicles, SCHOOL_ARRIVAL);
		assertEquals(2, fleet.routes().size());
		assertTrue(fleet.unplaced().isEmpty());
	}

	@Test
	void aStudentWhoFitsNoRouteInTimeIsUnreachableNotCapacity() {
		// Seats for both, but one vehicle cannot collect both before 07:30 without starting before 06:00.
		List<Stop> students = studentsAt(List.of(north(TWENTY_KM), south(TWENTY_KM)));
		List<Vehicle> fleetVehicles = vehicles(20);

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, students, fleetVehicles, SCHOOL_ARRIVAL);
		assertEquals(1, placed(fleet).size());
		assertEquals(List.of(Code.ARRIVAL_TIME_UNREACHABLE), unplacedCodes(fleet));
	}

	@Test
	void twoNeighbourhoodsGoOnTwoVehicles() {
		List<Coordinate> northPins = cluster(north(0.045), 6, 5); // about 5 km north
		List<Coordinate> southPins = cluster(south(0.045), 6, 6);
		List<Coordinate> pins = new ArrayList<>(northPins);
		pins.addAll(southPins);
		List<Stop> students = studentsAt(pins);
		List<Vehicle> fleetVehicles = vehicles(6, 6);

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, students, fleetVehicles, SCHOOL_ARRIVAL);
		assertEquals(2, fleet.routes().size());
		assertTrue(fleet.unplaced().isEmpty());
		Set<UUID> northIds = new HashSet<>(students.subList(0, 6).stream().map(Stop::studentId).toList());
		for (VehicleRoute route : fleet.routes()) {
			long fromNorth = route.plan().stops().stream().filter(stop -> northIds.contains(stop.studentId())).count();
			assertTrue(fromNorth == 0 || fromNorth == route.plan().stops().size(),
					"a route stays in one neighbourhood");
		}
	}

	@Test
	void spareVehiclesGetNoRoute() {
		List<Stop> students = studentsAt(randomPins(2, 7));
		List<Vehicle> fleetVehicles = demoFleet();

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, students, fleetVehicles, SCHOOL_ARRIVAL);
		assertEquals(2, placed(fleet).size());
		assertTrue(fleet.routes().size() < fleetVehicles.size(), "at least one vehicle is spare");
	}

	@Test
	void studentsAtTheSameAddressAreBothPlaced() {
		Coordinate home = new Coordinate(33.8959, 35.4818);
		List<Stop> siblings = studentsAt(List.of(home, home));
		List<Vehicle> fleetVehicles = vehicles(14);

		FleetPlan fleet = planner.plan(siblings, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, siblings, fleetVehicles, SCHOOL_ARRIVAL);
		assertEquals(2, placed(fleet).size());
	}

	@Test
	void noStudentsGiveNoRoutes() {
		FleetPlan fleet = planner.plan(List.of(), demoFleet(), SCHOOL, SCHOOL_ARRIVAL);

		assertTrue(fleet.routes().isEmpty());
		assertTrue(fleet.unplaced().isEmpty());
	}

	@Test
	void noVehiclesReportEveryStudentAsCapacity() {
		List<Stop> students = studentsAt(randomPins(3, 8));

		FleetPlan fleet = planner.plan(students, List.of(), SCHOOL, SCHOOL_ARRIVAL);

		assertKeepsTheRules(fleet, students, List.of(), SCHOOL_ARRIVAL);
		assertEquals(List.of(Code.CAPACITY_EXCEEDED, Code.CAPACITY_EXCEEDED, Code.CAPACITY_EXCEEDED),
				unplacedCodes(fleet));
	}

	@Test
	void aSchoolArrivalBeforeTheEarliestPickupPlacesNobody() {
		List<Stop> students = studentsAt(randomPins(3, 9));
		List<Vehicle> fleetVehicles = demoFleet();
		LocalTime arrival = LocalTime.of(5, 30);

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, arrival);

		assertKeepsTheRules(fleet, students, fleetVehicles, arrival);
		assertTrue(fleet.routes().isEmpty());
		assertEquals(List.of(Code.ARRIVAL_TIME_UNREACHABLE, Code.ARRIVAL_TIME_UNREACHABLE,
				Code.ARRIVAL_TIME_UNREACHABLE), unplacedCodes(fleet));
	}

	@Test
	void aRouteThatIsTooLateOnItsOwnTimesIsReportedNotKept() {
		// Like the road client above its point limit: the whole-fleet matrix (3 points here) is straight-line,
		// but a route's own smaller matrix is three times slower. 40 minutes passes the assignment; 120 does not.
		TravelTimes slowerForOneRoute = points -> {
			Duration[][] matrix = straightLine.matrix(points);
			if (points.size() <= 2) {
				for (Duration[] row : matrix) {
					for (int j = 0; j < row.length; j++) {
						row[j] = row[j].multipliedBy(3);
					}
				}
			}
			return matrix;
		};
		FleetPlanner roadPlanner = new FleetPlanner(slowerForOneRoute, new OrToolsRouteOptimizer(slowerForOneRoute));
		List<Stop> students = studentsAt(List.of(north(TWENTY_KM), south(TWENTY_KM)));

		FleetPlan fleet = roadPlanner.plan(students, vehicles(14, 14), SCHOOL, SCHOOL_ARRIVAL);

		assertTrue(fleet.routes().isEmpty());
		assertEquals(List.of(Code.ARRIVAL_TIME_UNREACHABLE, Code.ARRIVAL_TIME_UNREACHABLE), unplacedCodes(fleet));
		assertEquals(students.stream().map(Stop::studentId).collect(Collectors.toSet()),
				fleet.unplaced().stream().map(Unplaced::studentId).collect(Collectors.toSet()));
	}

	@Test
	void aFirstPickupExactlyAtSixIsAllowed() {
		// Arriving at 06:00 leaves no driving at all: a student at the school's own pin rides, one a kilometre away cannot.
		Stop atSchool = new Stop(UUID.randomUUID(), SCHOOL);
		Stop nearby = new Stop(UUID.randomUUID(), north(0.009));
		List<Stop> students = List.of(atSchool, nearby);
		List<Vehicle> fleetVehicles = vehicles(14, 14);
		LocalTime six = RouteTimings.EARLIEST_FIRST_PICKUP;

		FleetPlan fleet = planner.plan(students, fleetVehicles, SCHOOL, six);

		assertKeepsTheRules(fleet, students, fleetVehicles, six);
		assertEquals(Set.of(atSchool.studentId()), placed(fleet));
		assertEquals(nearby.studentId(), fleet.unplaced().get(0).studentId());
	}

	@Test
	void aNegativeCapacityIsRejected() {
		assertThrows(IllegalArgumentException.class, () -> new Vehicle(UUID.randomUUID(), -1));
	}

	@Test
	void sixtyStudentsArePlannedWithinTheTimeBudget() {
		List<Stop> students = studentsAt(randomPins(60, 10));
		List<Vehicle> fleetVehicles = vehicles(15, 15, 15, 15);

		// The documented budget: at most 5 s for the assignment and 2 s for each route's own ordering.
		FleetPlan fleet = assertTimeout(Duration.ofSeconds(5 + 2 * fleetVehicles.size()),
				() -> planner.plan(students, fleetVehicles, SCHOOL, SCHOOL_ARRIVAL));

		assertKeepsTheRules(fleet, students, fleetVehicles, SCHOOL_ARRIVAL);
		assertEquals(60, placed(fleet).size());
	}

	/** Up to {@code maxStudents} pins and {@code maxVehicles} vehicles of 0 to {@code maxSeats} seats, arriving 05:50 to 08:00. */
	private record Instance(List<Stop> students, List<Vehicle> vehicles, LocalTime arrival) {

		static Instance random(Random random, int maxStudents, int maxVehicles, int maxSeats, double spread) {
			List<Stop> students = studentsAt(IntStream.range(0, 1 + random.nextInt(maxStudents))
					.mapToObj(i -> new Coordinate(SCHOOL.latitude() + (random.nextDouble() - 0.5) * spread,
							SCHOOL.longitude() + (random.nextDouble() - 0.5) * spread))
					.toList());
			List<Vehicle> vehicles = IntStream.range(0, random.nextInt(maxVehicles + 1))
					.mapToObj(i -> new Vehicle(UUID.randomUUID(), random.nextInt(maxSeats + 1))).toList();
			return new Instance(students, vehicles, LocalTime.of(5, 50).plusMinutes(random.nextInt(130)));
		}
	}

	@Test
	void randomSchoolsKeepEveryRule() {
		Random random = new Random(206);
		for (int i = 0; i < 8; i++) {
			// Up to 33 km across, empty and zero-seat vehicles, and arrivals before 06:00 included.
			Instance school = Instance.random(random, 20, 4, 12, 0.3);

			FleetPlan fleet = planner.plan(school.students(), school.vehicles(), SCHOOL, school.arrival());

			assertKeepsTheRules(fleet, school.students(), school.vehicles(), school.arrival());
		}
	}

	@Test
	void smallSchoolsMatchTheBestPossibleAnswer() {
		Random random = new Random(7);
		for (int i = 0; i < 12; i++) {
			Instance school = Instance.random(random, 6, 3, 4, 0.25);
			List<Coordinate> points = new ArrayList<>(school.students().stream().map(Stop::location).toList());
			points.add(SCHOOL);
			long[] best = bruteForce(school, straightLine.matrix(points));

			FleetPlan fleet = planner.plan(school.students(), school.vehicles(), SCHOOL, school.arrival());

			assertKeepsTheRules(fleet, school.students(), school.vehicles(), school.arrival());
			long driving = fleet.routes().stream().mapToLong(r -> r.plan().totalDrivingTime().toMinutes()).sum();
			assertEquals(best[0], placed(fleet).size(), "as many students placed as possible");
			assertEquals(best[1], driving, "the least total driving among answers that place that many");
		}
	}

	/**
	 * Every way to put each student on a vehicle or leave them out, each route in its best order:
	 * the most students placed, then the least total driving. Returns {placed, minutes}.
	 */
	private static long[] bruteForce(Instance school, Duration[][] matrix) {
		int n = school.students().size();
		long budget = school.arrival().toSecondOfDay() / 60 - RouteTimings.EARLIEST_FIRST_PICKUP.toSecondOfDay() / 60;
		long[] bestPath = new long[1 << n];
		for (int set = 1; set < 1 << n; set++) {
			int members = set;
			bestPath[set] = bestOpenPath(IntStream.range(0, n).filter(i -> (members >> i & 1) == 1).toArray(), 0, matrix, n);
		}
		int vehicleCount = school.vehicles().size();
		long[] best = { 0, 0 };
		for (int choice = 0; choice < Math.pow(vehicleCount + 1, n); choice++) {
			int[] sets = new int[vehicleCount];
			int placed = 0;
			for (int i = 0, rest = choice; i < n; i++, rest /= vehicleCount + 1) {
				int vehicle = rest % (vehicleCount + 1);
				if (vehicle > 0) {
					sets[vehicle - 1] |= 1 << i;
					placed++;
				}
			}
			long minutes = 0;
			boolean allowed = true;
			for (int v = 0; v < vehicleCount && allowed; v++) {
				if (sets[v] != 0) {
					allowed = Integer.bitCount(sets[v]) <= school.vehicles().get(v).capacity() && bestPath[sets[v]] <= budget;
					minutes += bestPath[sets[v]];
				}
			}
			if (allowed && (placed > best[0] || placed == best[0] && minutes < best[1])) {
				best = new long[] { placed, minutes };
			}
		}
		return best;
	}

	/** The shortest path through {@code stops} that ends at the school (matrix index {@code school}), every order tried. */
	private static long bestOpenPath(int[] stops, int from, Duration[][] matrix, int school) {
		if (from == stops.length) {
			long minutes = 0;
			for (int i = 0; i < stops.length; i++) {
				minutes += matrix[stops[i]][i + 1 < stops.length ? stops[i + 1] : school].toMinutes();
			}
			return minutes;
		}
		long best = Long.MAX_VALUE;
		for (int i = from; i < stops.length; i++) {
			int[] swapped = stops.clone();
			swapped[from] = stops[i];
			swapped[i] = stops[from];
			best = Math.min(best, bestOpenPath(swapped, from + 1, matrix, school));
		}
		return best;
	}
}
