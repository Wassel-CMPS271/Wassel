package com.wassel.backend.routing.service;

import com.wassel.backend.routing.service.RouteOptimizer.Code;
import com.wassel.backend.routing.service.RouteOptimizer.PlannedStop;
import com.wassel.backend.routing.service.RouteOptimizer.Plan;
import com.wassel.backend.routing.service.RouteOptimizer.Reason;
import com.wassel.backend.routing.service.RouteOptimizer.Stop;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RouteOptimizerTests {

	private static final PlannedStop STOP = new PlannedStop(UUID.randomUUID(), LocalTime.of(7, 20));
	private static final Reason REASON = new Reason(Code.CAPACITY_EXCEEDED, "The route has 4 students but the vehicle seats 3.");

	@Test
	void aFeasiblePlanHasStopsAndNoReasons() {
		assertDoesNotThrow(() -> new Plan(true, List.of(STOP), Duration.ofMinutes(13), List.of()));
	}

	@Test
	void aPlanThatIsNotFeasibleHasReasonsNoStopsAndZeroTime() {
		assertDoesNotThrow(() -> new Plan(false, List.of(), Duration.ZERO, List.of(REASON)));
	}

	@Test
	void aFeasiblePlanWithReasonsIsRejected() {
		assertThrows(IllegalArgumentException.class,
				() -> new Plan(true, List.of(STOP), Duration.ofMinutes(13), List.of(REASON)));
	}

	@Test
	void aPlanThatIsNotFeasibleMustSayWhy() {
		assertThrows(IllegalArgumentException.class, () -> new Plan(false, List.of(), Duration.ZERO, List.of()));
	}

	@Test
	void aPlanThatIsNotFeasibleHasNoStopsAndNoTime() {
		assertThrows(IllegalArgumentException.class,
				() -> new Plan(false, List.of(STOP), Duration.ZERO, List.of(REASON)));
		assertThrows(IllegalArgumentException.class,
				() -> new Plan(false, List.of(), Duration.ofMinutes(5), List.of(REASON)));
	}

	@Test
	void aPlanKeepsItsOwnCopyOfTheLists() {
		List<PlannedStop> stops = new ArrayList<>(List.of(STOP));

		Plan plan = new Plan(true, stops, Duration.ofMinutes(13), List.of());
		stops.clear();

		assertEquals(1, plan.stops().size());
	}

	@Test
	void aStopNeedsAPin() {
		assertThrows(NullPointerException.class, () -> new Stop(UUID.randomUUID(), null));
	}
	@Test
	void proposedRoutePreservesStudentOrderAndArrivalTimes() {
		UUID firstStudent = UUID.randomUUID();
		UUID secondStudent = UUID.randomUUID();

		PlannedStop firstStop = new PlannedStop(
			firstStudent, LocalTime.of(7, 15)
	);

		PlannedStop secondStop = new PlannedStop(
			secondStudent, LocalTime.of(7, 25)
	);

		Plan plan = new Plan(
			true,
			List.of(firstStop, secondStop),
			Duration.ofMinutes(20),
			List.of()
	);

	assertEquals(List.of(firstStop, secondStop), plan.stops());
	assertEquals(LocalTime.of(7, 15), plan.stops().get(0).arrivalTime());
	assertEquals(LocalTime.of(7, 25), plan.stops().get(1).arrivalTime());
}
}
