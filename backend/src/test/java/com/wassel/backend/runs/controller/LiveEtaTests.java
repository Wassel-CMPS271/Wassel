package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-262: the live estimate and the stop progress (docs/contracts/runs.md "Live ETA and stop progress"). Real app,
 * real repositories, the PostgreSQL container and every Flyway migration; the test profile has no road provider, so
 * every leg is the routing contract's straight line (30 km/h, each leg rounded up to whole minutes).
 *
 * <p>The expected numbers are worked out by hand, never by the code under test. All the stops sit on one meridian, so a
 * leg is a difference of latitudes, and one degree is 111.195 km, which is 222.39 minutes at 30 km/h:
 * 0.01 degree is 2.22 minutes (3), 0.02 is 4.45 (5), 0.03 is 6.67 (7), 0.04 is 8.90 (9), 0.05 is 11.12 (12).
 */
class LiveEtaTests extends RunCriteriaSupport {

	private static final String MORNING = "MORNING";

	private static final String AFTERNOON = "AFTERNOON";

	private static final double LONGITUDE = 35.50;

	// The three stops of every route here, in order, and the bus's usual place before the first one.
	private static final double FIRST = 33.90;

	private static final double SECOND = 33.91;

	private static final double THIRD = 33.93;

	private static final double BEFORE_FIRST = 33.89;

	private static final AtomicInteger UNIQUE = new AtomicInteger();

	/** A route of three stops with a parent for the first, the second and the third, its morning run in progress and shared. */
	private record Trip(Bus bus, String run, UUID first, UUID second, UUID third, UUID parentOfFirst,
			UUID parentOfSecond, UUID parentOfThird) {
	}

	private UUID stopAt(String name, UUID parent, Double latitude) {
		int n = UNIQUE.incrementAndGet();
		return studentRepository.save(Student.builder().schoolId(school).firstName(name).lastName("Nasr").grade("4")
				.guardianName("Guardian of " + name).guardianPhone("+961 3 " + (700000 + n))
				.status(StudentStatus.ACTIVE).address(name + " Street, Beirut")
				.latitude(latitude == null ? null : BigDecimal.valueOf(latitude))
				.longitude(latitude == null ? null : BigDecimal.valueOf(LONGITUDE)).parentUserId(parent).build()).getId();
	}

	private Trip aTrip(String routeName) throws Exception {
		UUID pFirst = aParent();
		UUID pSecond = aParent();
		UUID pThird = aParent();
		Bus bus = aBus(routeName);
		UUID first = stopAt("Rami", pFirst, FIRST);
		UUID second = stopAt("Salma", pSecond, SECOND);
		UUID third = stopAt("Dana", pThird, THIRD);
		onRoute(bus, first, second, third);
		String run = runId(bus, MORNING);
		assertEquals(200, start(bus, run).getStatus());
		assertEquals(200, share(bus, run, true).getStatus());
		return new Trip(bus, run, first, second, third, pFirst, pSecond, pThird);
	}

	private MockHttpServletResponse share(Bus bus, String run, boolean enabled) throws Exception {
		return send(put("/api/driver/runs/" + run + "/location-sharing").with(as(Role.DRIVER, bus.driverUserId()))
				.contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":" + enabled + "}"));
	}

	private void fix(Bus bus, String run, double latitude) throws Exception {
		MockHttpServletResponse response = send(put("/api/driver/runs/" + run + "/location")
				.with(as(Role.DRIVER, bus.driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"latitude\":%s,\"longitude\":%s,\"accuracyMeters\":5}".formatted(latitude, LONGITUDE)));
		assertEquals(204, response.getStatus(), response.getContentAsString());
	}

	private void later(long seconds) {
		clock.set(clock.instant().plusSeconds(seconds));
	}

	private String parentSees(UUID parent, UUID child) throws Exception {
		MockHttpServletResponse response = send(get("/api/parent/children/" + child + "/bus-location")
				.with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private String headSees() throws Exception {
		MockHttpServletResponse response = send(get(HEAD_RUNS + "/locations")
				.with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID())));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	/** One field of one run in the head's list, at a path below the run (for example {@code .nextStop.estimate}). */
	private static Object headField(String list, String run, String path) {
		List<Object> found = JsonPath.read(list, "$[?(@.runId == '" + run + "')]" + path);
		assertEquals(1, found.size(), "the run " + run + " in the head's list");
		return found.get(0);
	}

	/** The sample and the real answer have the same fields, at the top and inside the position and the estimate. */
	private static void assertSameShape(String sampleFile, String actual) throws Exception {
		String sample = Files.readString(Path.of("../docs/contracts/samples/runs/" + sampleFile));
		for (String path : List.of("$", "$.position", "$.estimate")) {
			assertEquals(fieldsAt(sample, path), fieldsAt(actual, path), sampleFile + " " + path);
		}
	}

	private static Set<String> fieldsAt(String json, String path) {
		Object found = JsonPath.read(json, path);
		return found instanceof Map<?, ?> map ? new TreeSet<>(map.keySet().stream().map(String::valueOf).toList()) : Set.of();
	}

	private static Integer whole(Object number) {
		return number == null ? null : ((Number) number).intValue();
	}

	private static Integer secondsAway(String body) {
		return whole(JsonPath.read(body, "$.estimate.secondsAway"));
	}

	// ---------------------------------------------------------------- progress follows the confirmations

	@Test
	void progressFollowsTheConfirmationsAndTheChainShortens() throws Exception {
		Trip t = aTrip("Hamra morning run");
		Instant sent = clock.instant();
		fix(t.bus(), t.run(), BEFORE_FIRST);

		// Bus, first, second, third: 0.01 (3) + 0.01 (3) + 0.02 (5) = 11 minutes.
		String body = parentSees(t.parentOfThird(), t.third());
		assertEquals("LIVE", JsonPath.read(body, "$.status"));
		assertEquals(2, whole(JsonPath.read(body, "$.stopsLeft")));
		assertEquals(660, secondsAway(body));
		assertEquals(sent.plusSeconds(660), Instant.parse(JsonPath.read(body, "$.estimate.arrivesAt")));
		String head = headSees();
		assertEquals(3, whole(headField(head, t.run(), ".remainingStops")));
		assertEquals(t.first().toString(), headField(head, t.run(), ".nextStop.studentId"));
		assertEquals(180, whole(headField(head, t.run(), ".nextStop.estimate.secondsAway")), "bus to the first stop: 3 minutes");

		// The first stop is picked up: bus, second, third = 0.02 (5) + 0.02 (5) = 10 minutes.
		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());
		body = parentSees(t.parentOfThird(), t.third());
		assertEquals(1, whole(JsonPath.read(body, "$.stopsLeft")));
		assertEquals(600, secondsAway(body));

		// The second one is not present, which is also done: bus, third = 0.04 (9) = 9 minutes, and the child is next.
		assertEquals(200, confirm(t.bus(), t.run(), t.second(), "NOT_PRESENT").getStatus());
		body = parentSees(t.parentOfThird(), t.third());
		assertEquals(0, whole(JsonPath.read(body, "$.stopsLeft")), "0 means the child is next, not no value");
		assertEquals(540, secondsAway(body));
		head = headSees();
		assertEquals(1, whole(headField(head, t.run(), ".remainingStops")));
		assertEquals(t.third().toString(), headField(head, t.run(), ".nextStop.studentId"));
		assertEquals(540, whole(headField(head, t.run(), ".nextStop.estimate.secondsAway")));

		// The child is picked up: nothing is left for the parent, and nothing is left for the head either.
		assertEquals(200, confirm(t.bus(), t.run(), t.third(), "PICKED_UP").getStatus());
		body = parentSees(t.parentOfThird(), t.third());
		assertEquals("UNAVAILABLE", JsonPath.read(body, "$.status"));
		assertNull(JsonPath.read(body, "$.stopsLeft"));
		assertNull(JsonPath.read(body, "$.plannedTime"));
		assertNull(JsonPath.read(body, "$.estimate"));
		head = headSees();
		assertEquals("LIVE", headField(head, t.run(), ".status"), "the run is still in progress");
		assertEquals(0, whole(headField(head, t.run(), ".remainingStops")), "every stop is done");
		assertNull(headField(head, t.run(), ".nextStop"), "so there is no next stop to estimate");
	}

	@Test
	void aRunWithNoStopsAtAllHasNothingRemaining() throws Exception {
		Bus bus = aBus("Empty run");
		String run = runId(bus, MORNING);
		assertEquals(200, start(bus, run).getStatus());
		assertEquals(200, share(bus, run, true).getStatus());
		fix(bus, run, BEFORE_FIRST);

		String head = headSees();
		assertEquals("LIVE", headField(head, run, ".status"));
		assertEquals(0, whole(headField(head, run, ".remainingStops")));
		assertNull(headField(head, run, ".nextStop"));
	}

	@Test
	void anAbsentStopAddsNoLegAndIsNotRemaining() throws Exception {
		Trip t = aTrip("Hamra morning run");
		absentToday(t.parentOfSecond(), t.second());
		fix(t.bus(), t.run(), BEFORE_FIRST);

		// Bus, first, third (the second is skipped) = 0.01 (3) + 0.03 (7) = 10 minutes.
		String body = parentSees(t.parentOfThird(), t.third());
		assertEquals(1, whole(JsonPath.read(body, "$.stopsLeft")));
		assertEquals(600, secondsAway(body));
		assertEquals(2, whole(headField(headSees(), t.run(), ".remainingStops")));
	}

	@Test
	void afternoonProgressCountsDropOffsAndHasNoPlannedTime() throws Exception {
		Trip t = aTrip("Hamra morning run");
		assertEquals(200, end(t.bus(), t.run()).getStatus());
		String afternoon = runId(t.bus(), AFTERNOON);
		assertEquals(200, start(t.bus(), afternoon).getStatus());
		assertEquals(200, share(t.bus(), afternoon, true).getStatus());
		for (UUID child : List.of(t.first(), t.second(), t.third())) {
			assertEquals(200, confirm(t.bus(), afternoon, child, "PICKED_UP").getStatus(), "picked up at the gate");
		}
		fix(t.bus(), afternoon, 33.95);

		// The afternoon order is third, second, first. Bus (33.95), third (33.93), second (33.91), first (33.90):
		// 0.02 (5) + 0.02 (5) + 0.01 (3) = 13 minutes. Being on the bus is not being home: nothing is done yet.
		String body = parentSees(t.parentOfFirst(), t.first());
		assertEquals(2, whole(JsonPath.read(body, "$.stopsLeft")));
		assertNull(JsonPath.read(body, "$.plannedTime"), "an afternoon run has no schedule");
		assertEquals(780, secondsAway(body), "but it has a live estimate");
		assertSameShape("bus-location-afternoon.json", body);

		// The third child is dropped off: bus, second, first = 0.04 (9) + 0.01 (3) = 12 minutes.
		assertEquals(200, confirm(t.bus(), afternoon, t.third(), "DROPPED_OFF").getStatus());
		body = parentSees(t.parentOfFirst(), t.first());
		assertEquals(1, whole(JsonPath.read(body, "$.stopsLeft")));
		assertEquals(720, secondsAway(body));
		String head = headSees();
		assertEquals(2, whole(headField(head, afternoon, ".remainingStops")));
		assertEquals(t.second().toString(), headField(head, afternoon, ".nextStop.studentId"),
				"the afternoon's next stop is the second child, now that the third is home");
		assertNull(headField(head, afternoon, ".nextStop.plannedTime"));
		assertEquals(540, whole(headField(head, afternoon, ".nextStop.estimate.secondsAway")), "bus (33.95) to 33.91: 0.04 = 9 minutes");
	}

	// ---------------------------------------------------------------- stale and missing positions

	@Test
	void aStaleOrMissingPositionNeverGetsAnEstimateButKeepsTheProgress() throws Exception {
		Trip t = aTrip("Hamra morning run");

		// Sharing, but no position yet.
		String body = parentSees(t.parentOfThird(), t.third());
		assertEquals("UNAVAILABLE", JsonPath.read(body, "$.status"));
		assertEquals(2, whole(JsonPath.read(body, "$.stopsLeft")), "the progress does not need GPS");
		assertNotNull(JsonPath.read(body, "$.plannedTime"));
		assertNull(JsonPath.read(body, "$.estimate"));
		String head = headSees();
		assertEquals("UNAVAILABLE", headField(head, t.run(), ".status"));
		assertEquals(3, whole(headField(head, t.run(), ".remainingStops")));
		assertNotNull(headField(head, t.run(), ".nextStop.plannedTime"));
		assertNull(headField(head, t.run(), ".nextStop.estimate"));

		fix(t.bus(), t.run(), BEFORE_FIRST);
		later(60);
		body = parentSees(t.parentOfThird(), t.third());
		assertEquals("LIVE", JsonPath.read(body, "$.status"), "a fix of exactly 60 seconds is still live");
		assertEquals(600, secondsAway(body), "11 minutes from the fix, 60 seconds gone");

		later(1);
		body = parentSees(t.parentOfThird(), t.third());
		assertEquals("STALE", JsonPath.read(body, "$.status"));
		assertNotNull(JsonPath.read(body, "$.position"), "the last place is still shown");
		assertNull(JsonPath.read(body, "$.estimate"), "but no time is made up from it");
		assertEquals(2, whole(JsonPath.read(body, "$.stopsLeft")));
		assertNotNull(JsonPath.read(body, "$.plannedTime"));
		head = headSees();
		assertEquals("STALE", headField(head, t.run(), ".status"));
		assertEquals(3, whole(headField(head, t.run(), ".remainingStops")));
		assertNull(headField(head, t.run(), ".nextStop.estimate"));

		later(240);
		body = parentSees(t.parentOfThird(), t.third());
		assertEquals("UNAVAILABLE", JsonPath.read(body, "$.status"), "301 seconds: past what is shown");
		assertNull(JsonPath.read(body, "$.position"));
		assertNull(JsonPath.read(body, "$.estimate"));
		assertEquals(2, whole(JsonPath.read(body, "$.stopsLeft")));
	}

	@Test
	void withdrawingSharingEndsTheEstimateButNotTheProgress() throws Exception {
		Trip t = aTrip("Hamra morning run");
		fix(t.bus(), t.run(), BEFORE_FIRST);
		assertEquals(660, secondsAway(parentSees(t.parentOfThird(), t.third())));

		assertEquals(200, share(t.bus(), t.run(), false).getStatus());

		String body = parentSees(t.parentOfThird(), t.third());
		assertEquals("UNAVAILABLE", JsonPath.read(body, "$.status"));
		assertNull(JsonPath.read(body, "$.estimate"));
		assertEquals(2, whole(JsonPath.read(body, "$.stopsLeft")));
		assertNull(headField(headSees(), t.run(), ".nextStop.estimate"));
	}

	// ---------------------------------------------------------------- how the estimate is worked out

	@Test
	void theEstimateStartsFromTheFixAndIsNeverInThePast() throws Exception {
		Trip t = aTrip("Hamra morning run");
		Instant sent = clock.instant();
		fix(t.bus(), t.run(), BEFORE_FIRST);
		later(59);

		// 3 minutes from the fix, 59 seconds ago.
		String body = parentSees(t.parentOfFirst(), t.first());
		assertEquals(121, secondsAway(body));
		assertEquals(sent.plusSeconds(180), Instant.parse(JsonPath.read(body, "$.estimate.arrivesAt")));

		// The bus parks at the stop: no leg at all, and 30 seconds later the estimate is due, not negative.
		fix(t.bus(), t.run(), FIRST);
		later(30);
		body = parentSees(t.parentOfFirst(), t.first());
		assertEquals("LIVE", JsonPath.read(body, "$.status"));
		assertEquals(0, secondsAway(body));
		assertEquals(clock.instant(), Instant.parse(JsonPath.read(body, "$.estimate.arrivesAt")));
		assertEquals(0, whole(JsonPath.read(body, "$.stopsLeft")));
	}

	@Test
	void aStopWithoutAPinAddsNoLegAndHasNoEstimate() throws Exception {
		UUID pFirst = aParent();
		UUID pUnpinned = aParent();
		UUID pThird = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID first = stopAt("Rami", pFirst, FIRST);
		UUID unpinned = stopAt("Karim", pUnpinned, null);
		UUID third = stopAt("Dana", pThird, THIRD);
		onRoute(bus, first, unpinned, third);
		String run = runId(bus, MORNING);
		assertEquals(200, start(bus, run).getStatus());
		assertEquals(200, share(bus, run, true).getStatus());
		fix(bus, run, BEFORE_FIRST);

		// The unpinned stop is still a stop to do, but it cannot be placed: bus, first, third = 0.01 (3) + 0.03 (7).
		String body = parentSees(pThird, third);
		assertEquals(2, whole(JsonPath.read(body, "$.stopsLeft")));
		assertEquals(600, secondsAway(body));

		// Its own child has progress, no planned time (no pin, no schedule) and no estimate.
		body = parentSees(pUnpinned, unpinned);
		assertEquals(1, whole(JsonPath.read(body, "$.stopsLeft")));
		assertNull(JsonPath.read(body, "$.plannedTime"));
		assertNull(JsonPath.read(body, "$.estimate"));
		assertEquals(3, whole(headField(headSees(), run, ".remainingStops")));
	}

	@Test
	void thePlannedTimeIsTheScheduleAndTheEstimateIsAnotherField() throws Exception {
		Trip t = aTrip("Hamra morning run");
		fix(t.bus(), t.run(), BEFORE_FIRST);

		String body = parentSees(t.parentOfThird(), t.third());
		String route = send(get(ROUTES + "/" + t.bus().routeId()).with(head())).getContentAsString();
		List<String> childScheduled = JsonPath.read(route, "$.stops[?(@.studentId == '" + t.third() + "')].arrivalTime");
		List<String> firstScheduled = JsonPath.read(route, "$.stops[?(@.studentId == '" + t.first() + "')].arrivalTime");
		assertNotNull(childScheduled.get(0), "the route has a schedule: the school's arrival time is set");
		assertEquals(childScheduled.get(0), JsonPath.read(body, "$.plannedTime"), "the parent's planned time is the route's");
		assertEquals(firstScheduled.get(0), headField(headSees(), t.run(), ".nextStop.plannedTime"),
				"the head's next stop carries its own planned time");

		String listed = JsonPath.read(send(get("/api/parent/children").with(as(Role.PARENT, t.parentOfThird())))
				.getContentAsString(), "$[0].expectedPickupTime");
		assertEquals(listed, JsonPath.read(body, "$.plannedTime"), "and the one the children list already gives");

		// The estimate is a moment with a Z, the planned time a school-local HH:mm: they cannot be mistaken for each other.
		assertTrue(((String) JsonPath.read(body, "$.estimate.arrivesAt")).endsWith("Z"));
		assertTrue(((String) JsonPath.read(body, "$.plannedTime")).matches("\\d\\d:\\d\\d"));
	}

	@Test
	void aRunWhoseRouteIsDeletedLeavesTheListAndTheParentSeesNothing() throws Exception {
		Trip gone = aTrip("Hamra morning run");
		Trip kept = aTrip("Verdun morning run");
		fix(gone.bus(), gone.run(), BEFORE_FIRST);
		fix(kept.bus(), kept.run(), BEFORE_FIRST);

		assertEquals(204, send(delete(ROUTES + "/" + gone.bus().routeId()).with(head())).getStatus());

		String head = headSees();
		List<Object> listed = JsonPath.read(head, "$[?(@.runId == '" + gone.run() + "')]");
		assertEquals(List.of(), listed, "the deleted route's run is not listed, and the list does not fail");
		assertEquals(180, whole(headField(head, kept.run(), ".nextStop.estimate.secondsAway")), "the other bus is untouched");
		String body = parentSees(gone.parentOfThird(), gone.third());
		assertEquals("UNAVAILABLE", JsonPath.read(body, "$.status"));
		assertNull(JsonPath.read(body, "$.estimate"));
	}

	// ---------------------------------------------------------------- who sees what

	@Test
	void eachParentAndEachRunSeesOnlyTheirOwnNumbers() throws Exception {
		Trip hamra = aTrip("Hamra morning run");
		Trip verdun = aTrip("Verdun morning run");
		fix(hamra.bus(), hamra.run(), BEFORE_FIRST);
		// Verdun's bus is just past the first stop, which is still to do: bus, first, second, third =
		// 0.005 (1.11 minutes, so 2) + 0.01 (3) + 0.02 (5) = 10 minutes.
		fix(verdun.bus(), verdun.run(), 33.905);

		assertEquals(660, secondsAway(parentSees(hamra.parentOfThird(), hamra.third())));
		assertEquals(600, secondsAway(parentSees(verdun.parentOfThird(), verdun.third())));
		assertEquals(2, whole(JsonPath.read(parentSees(hamra.parentOfThird(), hamra.third()), "$.stopsLeft")));

		String head = headSees();
		assertEquals(180, whole(headField(head, hamra.run(), ".nextStop.estimate.secondsAway")));
		assertEquals(hamra.first().toString(), headField(head, hamra.run(), ".nextStop.studentId"));
		assertEquals(verdun.first().toString(), headField(head, verdun.run(), ".nextStop.studentId"));

		// Another parent's child, and another school's head, learn nothing.
		MockHttpServletResponse foreign = send(get("/api/parent/children/" + verdun.third() + "/bus-location")
				.with(as(Role.PARENT, hamra.parentOfThird())));
		assertEquals(404, foreign.getStatus());
		assertFalse(foreign.getContentAsString().contains("estimate"));
		assertFalse(foreign.getContentAsString().contains("stopsLeft"));
		MockHttpServletResponse otherSchool = send(get(HEAD_RUNS + "/locations")
				.with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), UUID.randomUUID())));
		assertEquals("[]", otherSchool.getContentAsString());
	}
}
