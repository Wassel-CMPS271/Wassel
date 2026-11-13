package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.LiveRunCriteriaSupport;
import com.wassel.backend.common.PendingFeature;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * SCRUM-272, for SCRUM-262: the live ETA and the stop progress, written from {@code docs/contracts/runs.md} "Live ETA and
 * stop progress" and the ticket's acceptance criteria, not from {@code LiveEtaTests} (the author's suite) or the code.
 * Real app, PostgreSQL, every migration; the test profile has no road provider, so a leg is the routing contract's straight
 * line: 30 km/h, great-circle distance, each leg rounded <b>up</b> to whole minutes.
 *
 * <p>The numbers are worked out by hand. All stops are on one meridian, so a leg is a difference of latitudes and one
 * degree is 111.195 km, which is 222.39 minutes: 0.01 degree is 2.22 minutes (3), 0.02 is 4.45 (5), 0.03 is 6.67 (7), 0.04
 * is 8.90 (9). Stops: FIRST 33.90, SECOND 33.91, THIRD 33.93; the bus is usually at 33.89. So from the bus: FIRST 3
 * minutes, SECOND 3 + 3 = 6, THIRD 3 + 3 + 5 = 11.
 *
 * <p>On {@code develop} this suite is off until the pull request that adds the feature merges ({@link PendingFeature}).
 */
@EnabledIf("pending")
class LiveEtaCriteriaTests extends LiveRunCriteriaSupport {

	static boolean pending() {
		return PendingFeature.present("SCRUM-262", "com.wassel.backend.runs.service.LiveEta");
	}

	private static Integer secondsAway(String body) {
		return whole(JsonPath.read(body, "$.estimate.secondsAway"));
	}

	private void shareAndFix(Trip t, double latitude) throws Exception {
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), latitude);
	}

	private static Set<String> keys(String json, String path) {
		Object found = JsonPath.read(json, path);
		return found instanceof Map<?, ?> map ? new TreeSet<>(map.keySet().stream().map(String::valueOf).toList()) : Set.of();
	}

	// ---------------------------------------------------------------- the estimate

	@Test
	void theEstimateIsTheFixPlusEveryLegUpToTheChildsStop() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, BEFORE_FIRST);
		Instant fixedAt = clock.instant();
		later(10);

		String first = parentSees(t.parentOfFirst(), t.first());
		String second = parentSees(t.parentOfSecond(), t.second());
		String third = parentSees(t.parentOfThird(), t.third());

		assertEquals(180 - 10, secondsAway(first), "3 minutes from the fix, 10 seconds gone");
		assertEquals(360 - 10, secondsAway(second), "3 + 3 minutes");
		assertEquals(660 - 10, secondsAway(third), "3 + 3 + 5 minutes");
		assertEquals(fixedAt.plusSeconds(660), Instant.parse(JsonPath.read(third, "$.estimate.arrivesAt")),
				"the moment is the fix's receive time plus the legs, in UTC");
		assertEquals(0, whole(JsonPath.read(first, "$.stopsLeft")), "stopsLeft 0 is the child being next");
		assertEquals(1, whole(JsonPath.read(second, "$.stopsLeft")));
		assertEquals(2, whole(JsonPath.read(third, "$.stopsLeft")));
	}

	@Test
	void aDoneOrSkippedStopAddsNoLegAndTheChainShortens() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, BEFORE_FIRST);

		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());
		assertEquals(300, secondsAway(parentSees(t.parentOfSecond(), t.second())),
				"the bus goes straight to SECOND: 0.02 degree, 5 minutes");
		assertEquals(600, secondsAway(parentSees(t.parentOfThird(), t.third())), "5 + 5 minutes");
		assertEquals(0, whole(JsonPath.read(parentSees(t.parentOfSecond(), t.second()), "$.stopsLeft")));

		assertEquals(200, confirm(t.bus(), t.run(), t.second(), "NOT_PRESENT").getStatus());
		assertEquals(540, secondsAway(parentSees(t.parentOfThird(), t.third())),
				"a child who was not at the stop is skipped: straight to THIRD, 0.04 degree, 9 minutes");
	}

	@Test
	void anAbsentChildIsSkippedLikeOneNotAtTheStop() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, BEFORE_FIRST);
		absentToday(t.parentOfSecond(), t.second());

		assertEquals(600, secondsAway(parentSees(t.parentOfThird(), t.third())),
				"3 to FIRST, then FIRST to THIRD is 0.03 degree, 7 minutes: 10, not through the absent child's stop");
	}

	@Test
	void theEstimateIsNeverBeforeNowAndAnEstimateAlreadyDueReadsZero() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		// The bus is exactly on FIRST's pin: no distance, no leg, so the arrival is the fix's own time.
		shareAndFix(t, FIRST);
		later(30);

		String body = parentSees(t.parentOfFirst(), t.first());

		assertEquals("LIVE", JsonPath.read(body, "$.status"));
		assertEquals(0, secondsAway(body), "never negative, and 0 is not 'arrived'");
		assertEquals(clock.instant(), Instant.parse(JsonPath.read(body, "$.estimate.arrivesAt")),
				"never earlier than the moment of the answer");
		assertEquals(0, whole(JsonPath.read(body, "$.stopsLeft")), "only a confirmation says the bus has arrived");
	}

	@Test
	void aLegIsRoundedUpSoABusAFewMetresAwayIsAboutAMinute() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, 33.8999);
		later(30);

		assertEquals(30, secondsAway(parentSees(t.parentOfFirst(), t.first())), "11 metres is one whole minute");
	}

	// ---------------------------------------------------------------- only from a live fix

	@Test
	void anEstimateExistsOnlyWhileTheFixIsLiveAndTheProgressNeverDependsOnGps() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		LocalTime planned = plannedOf(t.bus(), t.third());
		shareAndFix(t, BEFORE_FIRST);

		later(60);
		String live = parentSees(t.parentOfThird(), t.third());
		assertEquals("LIVE", JsonPath.read(live, "$.status"));
		assertEquals(660 - 60, secondsAway(live), "60 seconds old is still live");

		later(1);
		String stale = parentSees(t.parentOfThird(), t.third());
		assertEquals("STALE", JsonPath.read(stale, "$.status"));
		assertNull(JsonPath.read(stale, "$.estimate"), "61 seconds: no time is made up from an old fix");
		assertNotNull(JsonPath.read(stale, "$.position"), "the last place is still shown");
		assertEquals(2, whole(JsonPath.read(stale, "$.stopsLeft")), "progress follows the confirmations");
		assertEquals(planned.toString(), JsonPath.read(stale, "$.plannedTime"), "and so does the plan");
		assertNull(positionOf(headSeesPositions(), t.run(), ".nextStop.estimate"), "nor for the head's next stop");

		later(240);
		String gone = parentSees(t.parentOfThird(), t.third());
		assertEquals("UNAVAILABLE", JsonPath.read(gone, "$.status"));
		assertNull(JsonPath.read(gone, "$.estimate"));
		assertEquals(2, whole(JsonPath.read(gone, "$.stopsLeft")), "301 seconds: still waiting, still 2 stops");
		assertEquals(planned.toString(), JsonPath.read(gone, "$.plannedTime"));
	}

	@Test
	void noPositionYetOrSharingOffGivesProgressAndPlanButNoEstimate() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		String off = parentSees(t.parentOfSecond(), t.second());
		assertEquals("UNAVAILABLE", JsonPath.read(off, "$.status"));
		assertNull(JsonPath.read(off, "$.estimate"));
		assertEquals(1, whole(JsonPath.read(off, "$.stopsLeft")));
		assertNotNull(JsonPath.read(off, "$.plannedTime"));

		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		assertNull(JsonPath.read(parentSees(t.parentOfSecond(), t.second()), "$.estimate"), "opted in, no position yet");
		fix(t.bus(), t.run(), BEFORE_FIRST);
		assertNotNull(JsonPath.read(parentSees(t.parentOfSecond(), t.second()), "$.estimate"));
		assertEquals(200, share(t.bus(), t.run(), false).getStatus());
		assertNull(JsonPath.read(parentSees(t.parentOfSecond(), t.second()), "$.estimate"), "withdrawn: gone at once");
		assertEquals(1, whole(JsonPath.read(parentSees(t.parentOfSecond(), t.second()), "$.stopsLeft")));
	}

	// ---------------------------------------------------------------- planned and live are different things

	@Test
	void thePlannedTimeIsTheSchedulesAndTheEstimateAMomentInUtcUnderAnotherName() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, BEFORE_FIRST);

		String body = parentSees(t.parentOfThird(), t.third());

		String planned = JsonPath.read(body, "$.plannedTime");
		assertTrue(planned.matches("\\d\\d:\\d\\d"), planned);
		assertEquals(plannedOf(t.bus(), t.third()).toString(), planned, "the route's own arrival time for that stop");
		assertEquals(planned, JsonPath.read(send(get("/api/parent/children").with(as(Role.PARENT, t.parentOfThird())))
				.getContentAsString(), "$[0].expectedPickupTime"), "and the one the children list already gives");
		String arrives = JsonPath.read(body, "$.estimate.arrivesAt");
		assertTrue(arrives.endsWith("Z"), arrives);
		assertEquals(Set.of("arrivesAt", "secondsAway"), keys(body, "$.estimate"));
		assertFalse(keys(body, "$").contains("delay"), "no lateness value is defined by the contract");
		assertFalse(body.contains("late"), body);
	}

	@Test
	void anAfternoonRunUsesTheMorningOrderReversedAndHasNoPlannedTime() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		// The morning run ends; the afternoon run of the same route starts, with everyone on the bus.
		assertEquals(200, end(t.bus(), t.run()).getStatus());
		String afternoon = runId(t.bus(), AFTERNOON);
		assertEquals(200, start(t.bus(), afternoon).getStatus());
		assertEquals(200, share(t.bus(), afternoon, true).getStatus());
		fix(t.bus(), afternoon, 33.94);

		String third = parentSees(t.parentOfThird(), t.third());
		String second = parentSees(t.parentOfSecond(), t.second());
		String first = parentSees(t.parentOfFirst(), t.first());

		assertEquals(0, whole(JsonPath.read(third, "$.stopsLeft")), "THIRD is dropped off first");
		assertEquals(2, whole(JsonPath.read(first, "$.stopsLeft")));
		assertEquals(180, secondsAway(third), "33.94 to 33.93: 3 minutes");
		assertEquals(480, secondsAway(second), "3 + 33.93 to 33.91 (5) minutes");
		assertEquals(660, secondsAway(first), "3 + 5 + 3 minutes");
		for (String body : List.of(first, second, third)) {
			assertNull(JsonPath.read(body, "$.plannedTime"), "there is no afternoon schedule");
		}
		assertEquals(200, confirm(t.bus(), afternoon, t.third(), "PICKED_UP").getStatus());
		assertEquals(200, confirm(t.bus(), afternoon, t.third(), "DROPPED_OFF").getStatus());
		assertNull(JsonPath.read(parentSees(t.parentOfThird(), t.third()), "$.stopsLeft"), "dropped off: no longer waiting");
		assertEquals(0, whole(JsonPath.read(parentSees(t.parentOfSecond(), t.second()), "$.stopsLeft")));
	}

	// ---------------------------------------------------------------- stops that cannot be placed

	@Test
	void aStopWithoutAPinAddsNoLegAndHasNoEstimateOfItsOwn() throws Exception {
		UUID p1 = aParent();
		UUID p2 = aParent();
		UUID p3 = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID first = stopAt("Rami", p1, FIRST);
		UUID noPin = stopAt("Nopin", p2, null);
		UUID third = stopAt("Dana", p3, THIRD);
		onRoute(bus, first, noPin, third);
		String run = runId(bus, MORNING);
		assertEquals(200, start(bus, run).getStatus());
		assertEquals(200, share(bus, run, true).getStatus());
		fix(bus, run, BEFORE_FIRST);

		String own = parentSees(p2, noPin);
		assertNull(JsonPath.read(own, "$.estimate"), "the target has no pin: it cannot be placed");
		assertEquals(1, whole(JsonPath.read(own, "$.stopsLeft")), "but it is still a stop to do");
		assertEquals(3 * 60 + 7 * 60, secondsAway(parentSees(p3, third)),
				"3 minutes to FIRST, then straight to THIRD, 0.03 degree, 7 minutes");
	}

	// ---------------------------------------------------------------- a child who is not waiting

	@Test
	void aChildWhoIsNotWaitingHasNoProgressPlanOrEstimate() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, BEFORE_FIRST);
		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());

		String body = parentSees(t.parentOfFirst(), t.first());

		assertEquals("UNAVAILABLE", JsonPath.read(body, "$.status"));
		assertNull(JsonPath.read(body, "$.stopsLeft"));
		assertNull(JsonPath.read(body, "$.plannedTime"));
		assertNull(JsonPath.read(body, "$.estimate"));
		assertNull(JsonPath.read(body, "$.position"));

		absentToday(t.parentOfThird(), t.third());
		String absent = parentSees(t.parentOfThird(), t.third());
		assertNull(JsonPath.read(absent, "$.stopsLeft"));
		assertNull(JsonPath.read(absent, "$.estimate"));
	}

	@Test
	void anotherFamilysChildGetsNoNumbersAtAll() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, BEFORE_FIRST);

		MockHttpServletResponse response = parentReads(t.parentOfSecond(), t.first());

		assertEquals(404, response.getStatus());
		for (String leaked : List.of("estimate", "stopsLeft", "plannedTime", "secondsAway", "arrivesAt")) {
			assertFalse(response.getContentAsString().contains(leaked), leaked);
		}
	}

	// ---------------------------------------------------------------- what the head sees

	@Test
	void theHeadSeesHowManyStopsRemainAndTheNextOneWithItsPlanAndEstimate() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, BEFORE_FIRST);
		later(20);

		String list = headSeesPositions();

		assertEquals(3, whole(positionOf(list, t.run(), ".remainingStops")));
		assertEquals(t.first().toString(), positionOf(list, t.run(), ".nextStop.studentId"));
		assertEquals("Rami", positionOf(list, t.run(), ".nextStop.firstName"));
		assertEquals("Nasr", positionOf(list, t.run(), ".nextStop.lastName"));
		assertEquals(plannedOf(t.bus(), t.first()).toString(), positionOf(list, t.run(), ".nextStop.plannedTime"));
		assertEquals(160, whole(positionOf(list, t.run(), ".nextStop.estimate.secondsAway")));

		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());
		list = headSeesPositions();
		assertEquals(2, whole(positionOf(list, t.run(), ".remainingStops")));
		assertEquals(t.second().toString(), positionOf(list, t.run(), ".nextStop.studentId"));
		assertEquals(5 * 60 - 20, whole(positionOf(list, t.run(), ".nextStop.estimate.secondsAway")),
				"the bus goes straight to SECOND: 0.02 degree, 5 minutes");
	}

	@Test
	void zeroRemainingStopsHasNoNextStopAndARunWithNoStopsReadsTheSame() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, BEFORE_FIRST);
		for (UUID child : List.of(t.first(), t.second())) {
			assertEquals(200, confirm(t.bus(), t.run(), child, "PICKED_UP").getStatus());
		}
		assertEquals(200, confirm(t.bus(), t.run(), t.third(), "NOT_PRESENT").getStatus());

		String list = headSeesPositions();
		assertEquals(0, whole(positionOf(list, t.run(), ".remainingStops")));
		assertNull(positionOf(list, t.run(), ".nextStop"), "every stop done or skipped: nothing to estimate");
		assertEquals("IN_PROGRESS", JsonPath.read(summaryOf(t.run()), "$.state"), "the run itself is still in progress");

		Bus empty = aBus("Verdun morning run");
		String emptyRun = runId(empty, MORNING);
		assertEquals(200, start(empty, emptyRun).getStatus());
		list = headSeesPositions();
		assertEquals(0, whole(positionOf(list, emptyRun, ".remainingStops")));
		assertNull(positionOf(list, emptyRun, ".nextStop"));
	}

	@Test
	void theHeadsNextStopWithNoLiveFixHasThePlanAndNoEstimate() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");

		String list = headSeesPositions();

		assertEquals("UNAVAILABLE", positionOf(list, t.run(), ".status"));
		assertEquals(3, whole(positionOf(list, t.run(), ".remainingStops")));
		assertNotNull(positionOf(list, t.run(), ".nextStop.plannedTime"));
		assertNull(positionOf(list, t.run(), ".nextStop.estimate"));
	}

	// ---------------------------------------------------------------- the samples

	@Test
	void theContractsSamplesHaveTheFieldsOfTheRealAnswers() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		shareAndFix(t, BEFORE_FIRST);
		String live = parentSees(t.parentOfFirst(), t.first());
		String sample = Files.readString(Path.of("../docs/contracts/samples/runs/bus-location-live.json"));
		for (String path : List.of("$", "$.position", "$.estimate")) {
			assertEquals(keys(sample, path), keys(live, path), "bus-location-live.json " + path);
		}

		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());
		String unavailable = parentSees(t.parentOfFirst(), t.first());
		assertEquals(keys(Files.readString(Path.of("../docs/contracts/samples/runs/bus-location-unavailable.json")), "$")
				.contains("estimate"), keys(unavailable, "$").contains("estimate"));

		String list = headSeesPositions();
		String listSample = Files.readString(Path.of("../docs/contracts/samples/runs/run-locations.json"));
		Map<String, Object> firstRun = JsonPath.read(list, "$[0]");
		assertEquals(keys(listSample, "$[0]"), new TreeSet<>(firstRun.keySet()),
				"run-locations.json");
	}
}
