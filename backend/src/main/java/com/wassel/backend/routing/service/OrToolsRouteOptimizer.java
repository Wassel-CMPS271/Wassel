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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Orders one route's stops with Google OR-Tools, minimising the driving time from the first pickup
 * to the school. The search starts from the order it was given and the result is never worse than
 * that order: if the search ever returns something costlier, the given order is used.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrToolsRouteOptimizer implements RouteOptimizer {

	/**
	 * Guided local search escapes the local optima greedy descent got stuck in (36 min against a
	 * best of 32 on a 6-stop route), but it only stops at its time limit, so the limit grows with
	 * the route and is capped well inside the 5 s the story allows for 30 stops.
	 */
	private static final long MILLIS_PER_STOP = 50;
	private static final long MAX_SEARCH_MILLIS = 2_000;

	private final TravelTimes travelTimes;

	@Override
	public Plan optimize(List<Stop> stops, Coordinate school, int capacity, LocalTime schoolArrivalTime) {
		int n = stops.size();
		if (n > capacity) {
			return notFeasible(RouteOptimizer.Code.CAPACITY_EXCEEDED,
					"The route has %d students but the vehicle seats %d.".formatted(n, capacity));
		}

		// One matrix per route: the stops in input order, then the school at index n.
		List<Coordinate> points = new ArrayList<>(n + 1);
		stops.forEach(stop -> points.add(stop.location()));
		points.add(school);
		java.time.Duration[][] matrix = travelTimes.matrix(points);

		int[] manual = new int[n];
		for (int i = 0; i < n; i++) {
			manual[i] = i;
		}
		int[] order = solve(matrix, manual);
		if (!isPermutation(order, n) || cost(matrix, order) > cost(matrix, manual)) {
			log.warn("Solver order was invalid or costs more than the given order's {} min; using the given order",
					cost(matrix, manual));
			order = manual;
		}

		RouteTimings.Timing timing = RouteTimings.schedule(matrix, order, n, schoolArrivalTime);
		if (timing.startsTooEarly()) {
			String message = timing.crossesMidnight()
					? "The best order found needs %d minutes of driving, which would start before midnight."
							.formatted(timing.drivingTime().toMinutes())
					: "The best order found starts at %s, before the earliest pickup of %s."
							.formatted(timing.arrivals().get(0), RouteTimings.EARLIEST_FIRST_PICKUP);
			return notFeasible(RouteOptimizer.Code.ARRIVAL_TIME_UNREACHABLE, message);
		}

		List<PlannedStop> planned = new ArrayList<>(n);
		for (int i = 0; i < n; i++) {
			planned.add(new PlannedStop(stops.get(order[i]).studentId(), timing.arrivals().get(i)));
		}
		return new Plan(true, planned, timing.drivingTime(), List.of());
	}

	private static Plan notFeasible(Code code, String message) {
		return new Plan(false, List.of(), java.time.Duration.ZERO, List.of(new Reason(code, message)));
	}

	/** True when {@code order} visits each of the {@code n} stops exactly once. */
	static boolean isPermutation(int[] order, int n) {
		if (order.length != n) {
			return false;
		}
		boolean[] seen = new boolean[n];
		for (int stop : order) {
			if (stop < 0 || stop >= n || seen[stop]) {
				return false;
			}
			seen[stop] = true;
		}
		return true;
	}

	/** Whole minutes from the first pickup to the school, for a visiting order of stop indices. */
	private static long cost(java.time.Duration[][] matrix, int[] order) {
		int school = order.length;
		long total = 0;
		int next = school;
		for (int i = order.length - 1; i >= 0; i--) {
			total += matrix[order[i]][next].toMinutes();
			next = order[i];
		}
		return total;
	}

	/**
	 * An open path: a dummy start node costs nothing to leave, so the first pickup is free, and the
	 * school (index n) is the fixed end. Returns stop indices in visiting order.
	 */
	private static int[] solve(java.time.Duration[][] matrix, int[] seed) {
		int n = seed.length;
		Loader.loadNativeLibraries();

		int school = n;
		int start = n + 1;
		RoutingIndexManager manager = new RoutingIndexManager(n + 2, 1, new int[] { start }, new int[] { school });
		RoutingModel routing = new RoutingModel(manager);
		int transit = routing.registerTransitCallback((fromIndex, toIndex) -> {
			int from = manager.indexToNode(fromIndex);
			int to = manager.indexToNode(toIndex);
			return from == start || to == start ? 0 : matrix[from][to].toMinutes();
		});
		routing.setArcCostEvaluatorOfAllVehicles(transit);

		long millis = Math.min(MAX_SEARCH_MILLIS, MILLIS_PER_STOP * n);
		RoutingSearchParameters params = main.defaultRoutingSearchParameters().toBuilder()
				.setFirstSolutionStrategy(FirstSolutionStrategy.Value.PATH_CHEAPEST_ARC)
				.setLocalSearchMetaheuristic(LocalSearchMetaheuristic.Value.GUIDED_LOCAL_SEARCH)
				.setTimeLimit(Duration.newBuilder().setSeconds(millis / 1000).setNanos((int) (millis % 1000) * 1_000_000)
						.build())
				.build();
		routing.closeModelWithParameters(params);

		long[][] seedRoute = new long[1][n];
		for (int i = 0; i < n; i++) {
			seedRoute[0][i] = manager.nodeToIndex(seed[i]);
		}
		Assignment initial = routing.readAssignmentFromRoutes(seedRoute, true);
		Assignment solution = initial == null
				? routing.solveWithParameters(params)
				: routing.solveFromAssignmentWithParameters(initial, params);
		if (solution == null) {
			return seed;
		}

		int[] order = new int[n];
		int count = 0;
		for (long index = solution.value(routing.nextVar(routing.start(0))); !routing.isEnd(index);
				index = solution.value(routing.nextVar(index))) {
			order[count++] = manager.indexToNode(index);
		}
		return order;
	}
}
