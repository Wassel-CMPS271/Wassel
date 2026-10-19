package com.wassel.backend.routing.service;

import com.google.ortools.Loader;
import com.google.ortools.constraintsolver.Assignment;
import com.google.ortools.constraintsolver.FirstSolutionStrategy;
import com.google.ortools.constraintsolver.LocalSearchMetaheuristic;
import com.google.ortools.constraintsolver.RoutingIndexManager;
import com.google.ortools.constraintsolver.RoutingModel;
import com.google.ortools.constraintsolver.RoutingSearchParameters;
import com.google.ortools.constraintsolver.main;
import com.google.protobuf.Duration;
import com.wassel.backend.routing.service.RouteOptimizer.Code;
import com.wassel.backend.routing.service.RouteOptimizer.Plan;
import com.wassel.backend.routing.service.RouteOptimizer.Reason;
import com.wassel.backend.routing.service.RouteOptimizer.Stop;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Splits a school's students across its vehicles and orders each route (SCRUM-206). It only
 * proposes; nothing is saved. One OR-Tools model over one matrix decides who rides which vehicle,
 * within each vehicle's seats and a first pickup at or after {@link RouteTimings#EARLIEST_FIRST_PICKUP},
 * keeping the total driving time low. Each route is then ordered again by {@link RouteOptimizer} on
 * its own matrix, which is what gives a large school road times per route when the whole-fleet
 * matrix is too big for the road provider. A student who cannot be placed is reported with a
 * reason, never dropped silently.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FleetPlanner {

	/** The single-route solver's 50 ms per stop, capped higher because the model is the whole fleet. */
	private static final long MILLIS_PER_STUDENT = 50;
	private static final long MAX_SEARCH_MILLIS = 5_000;

	/** Leaving a student out costs more than any driving it could save, so only what cannot fit is left out. */
	private static final long DROP_PENALTY = 10_000_000;

	private final TravelTimes travelTimes;

	private final RouteOptimizer routeOptimizer;

	/** A vehicle the caller can put on a route (active, with a driver), and its seats. */
	public record Vehicle(UUID vehicleId, int capacity) {

		public Vehicle {
			Objects.requireNonNull(vehicleId, "vehicleId");
			if (capacity < 0) {
				throw new IllegalArgumentException("capacity must not be negative");
			}
		}
	}

	/** One vehicle's route: always a feasible plan with at least one stop. */
	public record VehicleRoute(UUID vehicleId, Plan plan) {
	}

	/** A student the planner could not place, and why. */
	public record Unplaced(UUID studentId, Reason reason) {
	}

	/** Every student given is on exactly one route or in {@code unplaced}. */
	public record FleetPlan(List<VehicleRoute> routes, List<Unplaced> unplaced) {

		public FleetPlan {
			routes = List.copyOf(routes);
			unplaced = List.copyOf(unplaced);
		}
	}

	public FleetPlan plan(List<Stop> students, List<Vehicle> vehicles, Coordinate school, LocalTime schoolArrivalTime) {
		int n = students.size();
		if (n == 0) {
			return new FleetPlan(List.of(), List.of());
		}
		long drivingBudget = schoolArrivalTime.toSecondOfDay() / 60
				- RouteTimings.EARLIEST_FIRST_PICKUP.toSecondOfDay() / 60;
		List<List<Integer>> assigned = vehicles.isEmpty() || drivingBudget < 0 ? List.of()
				: assign(students, vehicles, school, drivingBudget);

		List<VehicleRoute> routes = new ArrayList<>();
		List<Unplaced> unplaced = new ArrayList<>();
		Set<Integer> handled = new HashSet<>();
		// ponytail: routes are ordered one after another (about 7.5 s of 12.5 s at 150 students); run them in
		// parallel, or shorten RouteOptimizer's per-stop search, if a real school needs it faster.
		for (int v = 0; v < assigned.size(); v++) {
			List<Integer> onVehicle = assigned.get(v);
			if (onVehicle.isEmpty()) {
				continue;
			}
			List<Stop> stops = onVehicle.stream().map(students::get).toList();
			Plan plan = routeOptimizer.optimize(stops, school, vehicles.get(v).capacity(), schoolArrivalTime);
			if (plan.feasible()) {
				routes.add(new VehicleRoute(vehicles.get(v).vehicleId(), plan));
			} else {
				// Only when the route's own matrix is slower than the one it was assigned on: road times for
				// one route, straight-line for a fleet too big to ask the road provider about.
				log.warn("Route for vehicle {} fails on its own travel times ({}); its {} students are unplaced",
						vehicles.get(v).vehicleId(), plan.reasons().get(0).message(), stops.size());
				stops.forEach(stop -> unplaced.add(new Unplaced(stop.studentId(), plan.reasons().get(0))));
			}
			handled.addAll(onVehicle);
		}

		int seats = vehicles.stream().mapToInt(Vehicle::capacity).sum();
		Reason leftOut = n > seats
				? new Reason(Code.CAPACITY_EXCEEDED, "There are %d students but the vehicles seat %d.".formatted(n, seats))
				: new Reason(Code.ARRIVAL_TIME_UNREACHABLE,
						"No route can collect this student and reach school by %s without starting before %s."
								.formatted(schoolArrivalTime, RouteTimings.EARLIEST_FIRST_PICKUP));
		for (int i = 0; i < n; i++) {
			if (!handled.contains(i)) {
				unplaced.add(new Unplaced(students.get(i).studentId(), leftOut));
			}
		}
		return new FleetPlan(routes, unplaced);
	}

	/**
	 * The single-route solver's open path, for every vehicle at once: a shared dummy start costs
	 * nothing to leave, the school (index n) is every vehicle's end, each student takes a seat, a
	 * route's driving time is at most {@code drivingBudget} minutes, and a student may be left out at
	 * {@link #DROP_PENALTY}. Returns, per vehicle, its students' indices in visiting order.
	 */
	private List<List<Integer>> assign(List<Stop> students, List<Vehicle> vehicles, Coordinate school,
			long drivingBudget) {
		int n = students.size();
		List<Coordinate> points = new ArrayList<>(n + 1);
		students.forEach(student -> points.add(student.location()));
		points.add(school);
		java.time.Duration[][] matrix = travelTimes.matrix(points);
		Loader.loadNativeLibraries();

		int schoolNode = n;
		int start = n + 1;
		int vehicleCount = vehicles.size();
		int[] starts = new int[vehicleCount];
		int[] ends = new int[vehicleCount];
		long[] capacities = new long[vehicleCount];
		for (int v = 0; v < vehicleCount; v++) {
			starts[v] = start;
			ends[v] = schoolNode;
			capacities[v] = vehicles.get(v).capacity();
		}
		RoutingIndexManager manager = new RoutingIndexManager(n + 2, vehicleCount, starts, ends);
		RoutingModel routing = new RoutingModel(manager);

		int transit = routing.registerTransitCallback((fromIndex, toIndex) -> {
			int from = manager.indexToNode(fromIndex);
			int to = manager.indexToNode(toIndex);
			return from == start || to == start ? 0 : matrix[from][to].toMinutes();
		});
		routing.setArcCostEvaluatorOfAllVehicles(transit);
		routing.addDimension(transit, 0, drivingBudget, true, "Driving");
		int seat = routing.registerUnaryTransitCallback(index -> manager.indexToNode(index) < n ? 1 : 0);
		routing.addDimensionWithVehicleCapacity(seat, 0, capacities, true, "Seats");
		for (int i = 0; i < n; i++) {
			routing.addDisjunction(new long[] { manager.nodeToIndex(i) }, DROP_PENALTY);
		}

		long millis = Math.min(MAX_SEARCH_MILLIS, MILLIS_PER_STUDENT * n);
		RoutingSearchParameters params = main.defaultRoutingSearchParameters().toBuilder()
				.setFirstSolutionStrategy(FirstSolutionStrategy.Value.PATH_CHEAPEST_ARC)
				.setLocalSearchMetaheuristic(LocalSearchMetaheuristic.Value.GUIDED_LOCAL_SEARCH)
				.setTimeLimit(Duration.newBuilder().setSeconds(millis / 1000).setNanos((int) (millis % 1000) * 1_000_000)
						.build())
				.build();
		Assignment solution = routing.solveWithParameters(params);
		if (solution == null) {
			// Leaving everyone out is always a solution, so this is the solver failing, not a fact about the
			// students: reporting them all unreachable would be a false answer.
			throw new IllegalStateException("The fleet solver found no assignment for %d students and %d vehicles in %d ms"
					.formatted(n, vehicleCount, millis));
		}

		List<List<Integer>> routes = new ArrayList<>(vehicleCount);
		for (int v = 0; v < vehicleCount; v++) {
			List<Integer> route = new ArrayList<>();
			for (long index = solution.value(routing.nextVar(routing.start(v))); !routing.isEnd(index);
					index = solution.value(routing.nextVar(index))) {
				route.add(manager.indexToNode(index));
			}
			routes.add(route);
		}
		return routes;
	}
}
