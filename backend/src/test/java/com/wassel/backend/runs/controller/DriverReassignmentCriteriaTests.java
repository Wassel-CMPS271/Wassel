package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.LiveRunCriteriaSupport;
import com.wassel.backend.common.PendingFeature;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-272, for SCRUM-264: the driver reassignment, written from {@code docs/contracts/runs.md} "Reassigning a run's
 * driver" and the ticket's acceptance criteria (only the school's head; atomic and validated; the run's confirmations and
 * history kept; an audit trail; competing assignments leave no partial change and no leak), not from the author's suites
 * or the code. Real app, PostgreSQL, every migration. Everything is an HTTP answer.
 *
 * <p>On {@code develop} this suite is off until the pull request that adds the feature merges ({@link PendingFeature}).
 * The two tests that need the live location (SCRUM-261, merged) or the replay (SCRUM-263, open) say so.
 */
@EnabledIf("pending")
class DriverReassignmentCriteriaTests extends LiveRunCriteriaSupport {

	static boolean pending() {
		return PendingFeature.present("SCRUM-264", "com.wassel.backend.runs.entity.RunReassignment");
	}

	static boolean replayPresent() {
		return PendingFeature.present("SCRUM-263", "com.wassel.backend.runs.entity.ConfirmationKey");
	}

	private static final AtomicInteger UNIQUE = new AtomicInteger();

	/** A driver with no route (a spare) and the account they sign in with. */
	private record Spare(UUID user, UUID driver) {
	}

	private Spare aSpare() {
		UUID user = aDriverAccount();
		return new Spare(user, aDriverRecord(user));
	}

	private UUID aDriverWith(UUID schoolId, DriverStatus status) {
		int n = UNIQUE.incrementAndGet();
		return driverRepository.save(Driver.builder().schoolId(schoolId).firstName("Walid").lastName("Saad")
				.phone("+961 3 " + (200000 + n)).email("w" + n + "-" + UUID.randomUUID() + "@wassel.test").status(status)
				.invitedAt(Instant.now()).build()).getId();
	}

	/** A head of transportation who exists as an account, so the audit can name their email. */
	private UUID aHeadAccount() {
		return userRepository.save(User.builder().email("head-" + UUID.randomUUID() + "@wassel.test").passwordHash("x")
				.role(Role.HEAD_OF_TRANSPORT).schoolId(school).build()).getId();
	}

	private static String body(UUID driver, UUID from, String reason) {
		return "{\"driverId\":\"%s\",\"fromDriverId\":\"%s\"%s}".formatted(driver, from,
				reason == null ? "" : ",\"reason\":" + (reason.startsWith("\"") ? reason : "\"" + reason + "\""));
	}

	private MockHttpServletResponse reassign(UUID headUser, String run, String json) throws Exception {
		return send(post(HEAD_RUNS + "/" + run + "/reassignments").with(as(Role.HEAD_OF_TRANSPORT, headUser))
				.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private MockHttpServletResponse reassign(String run, UUID driver, UUID from) throws Exception {
		return reassign(UUID.randomUUID(), run, body(driver, from, null));
	}

	private MockHttpServletResponse history(String run) throws Exception {
		return send(get(HEAD_RUNS + "/" + run + "/reassignments").with(head()));
	}

	private int changes(String run) throws Exception {
		MockHttpServletResponse response = history(run);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return ((List<?>) JsonPath.read(response.getContentAsString(), "$")).size();
	}

	private String routeDriver(Bus bus) throws Exception {
		return JsonPath.read(send(get(ROUTES + "/" + bus.routeId()).with(head())).getContentAsString(), "$.driver.id");
	}

	private int todaysRuns(UUID driverUser) throws Exception {
		MockHttpServletResponse response = send(get(DRIVER_TODAY).with(as(Role.DRIVER, driverUser)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return ((List<?>) JsonPath.read(response.getContentAsString(), "$.runs")).size();
	}

	@SuppressWarnings("unchecked")
	private static Set<String> keys(String json, String path) {
		return new TreeSet<>(((Map<String, Object>) JsonPath.read(json, path)).keySet());
	}

	// ---------------------------------------------------------------- the change

	@Test
	void reassigningMidRunMovesTheRouteAndKeepsTheRunItsStateItsTimesAndItsConfirmations() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare spare = aSpare();
		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());
		String before = summaryOf(t.run());
		String afternoon = runId(t.bus(), AFTERNOON);

		MockHttpServletResponse response = reassign(aHeadAccount(), t.run(), body(spare.driver(), t.bus().driverId(), "Karim is unwell"));

		assertEquals(201, response.getStatus(), response.getContentAsString());
		String after = response.getContentAsString();
		for (String same : List.of("$.id", "$.state", "$.startedAt", "$.direction", "$.route.id", "$.vehicle.id")) {
			assertEquals(JsonPath.<Object>read(before, same), JsonPath.<Object>read(after, same), same);
		}
		assertEquals(JsonPath.<Object>read(before, "$.counts"), JsonPath.<Object>read(after, "$.counts"));
		assertEquals(spare.driver().toString(), JsonPath.read(after, "$.driver.id"));
		assertEquals(spare.driver().toString(), routeDriver(t.bus()));
		assertEquals(spare.driver().toString(), JsonPath.read(summaryOf(afternoon), "$.driver.id"),
				"both of today's runs: the route's driver changed");

		assertEquals(0, todaysRuns(t.bus().driverUserId()), "the old driver's list is empty at once");
		assertEquals(404, start(t.bus(), t.run()).getStatus());
		assertEquals(404, end(t.bus(), t.run()).getStatus());
		assertEquals(404, confirm(t.bus(), t.run(), t.second(), "PICKED_UP").getStatus());
		assertEquals(404, confirm(t.bus(), t.run(), t.first(), "DROPPED_OFF").getStatus());

		String newDay = send(get(DRIVER_TODAY).with(as(Role.DRIVER, spare.user()))).getContentAsString();
		assertEquals(2, ((List<?>) JsonPath.read(newDay, "$.runs")).size(), "the new driver gains both runs at once");
		List<String> status = JsonPath.read(newDay, "$.runs[?(@.id == '" + t.run() + "')].stops[?(@.studentId == '"
				+ t.first() + "')].confirmation.status");
		assertEquals(List.of("PICKED_UP"), status, "with the confirmations the old driver made");
		assertEquals(200, send(put("/api/driver/runs/" + t.run() + "/students/" + t.second() + "/confirmation")
				.with(as(Role.DRIVER, spare.user())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"status\":\"PICKED_UP\"}")).getStatus(), "and carries on");
		assertEquals(spare.driver().toString(), JsonPath.read(send(get("/api/parent/children")
				.with(as(Role.PARENT, t.parentOfFirst()))).getContentAsString(), "$[0].driver.id"), "a parent's child follows");
	}

	@Test
	void aRunThatHasNotStartedCanBeReassignedToo() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, stopAt("Rami", aParent(), FIRST));
		String run = runId(bus, MORNING);
		Spare spare = aSpare();

		MockHttpServletResponse response = reassign(aHeadAccount(), run, body(spare.driver(), bus.driverId(), null));

		assertEquals(201, response.getStatus(), response.getContentAsString());
		assertEquals("NOT_STARTED", JsonPath.read(response.getContentAsString(), "$.state"));
		assertEquals("NOT_STARTED", JsonPath.read(history(run).getContentAsString(), "$[0].runState"));
		assertEquals(200, start(busOf(spare.user(), spare.driver(), bus.vehicleId(), bus.routeId()), run).getStatus(),
				"the new driver starts it");
	}

	// ---------------------------------------------------------------- the audit trail

	@Test
	void theAuditListHasEveryChangeNewestFirstWithWhoWhenAndWhy() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare one = aSpare();
		Spare two = aSpare();
		UUID head = aHeadAccount();
		String afternoon = runId(t.bus(), AFTERNOON);
		Instant firstAt = clock.instant();

		assertEquals(201, reassign(head, t.run(), body(one.driver(), t.bus().driverId(), "  Karim is unwell  ")).getStatus());
		later(60);
		assertEquals(201, reassign(head, afternoon, body(two.driver(), one.driver(), null)).getStatus());

		String list = history(t.run()).getContentAsString();
		assertEquals(2, ((List<?>) JsonPath.read(list, "$")).size(), "every change of the route's driver on that date");
		assertEquals(two.driver().toString(), JsonPath.read(list, "$[0].toDriver.id"), "newest first");
		assertEquals(one.driver().toString(), JsonPath.read(list, "$[0].fromDriver.id"));
		assertEquals(AFTERNOON, JsonPath.read(list, "$[0].direction"), "the run the head acted on");
		assertEquals(afternoon, JsonPath.read(list, "$[0].runId"));
		assertEquals(MORNING, JsonPath.read(list, "$[1].direction"));
		assertEquals("IN_PROGRESS", JsonPath.read(list, "$[1].runState"), "its state at the moment of the change");
		assertEquals("NOT_STARTED", JsonPath.read(list, "$[0].runState"));
		assertEquals(t.bus().driverId().toString(), JsonPath.read(list, "$[1].fromDriver.id"));
		assertEquals("Karim", JsonPath.read(list, "$[1].fromDriver.firstName"));
		assertEquals(head.toString(), JsonPath.read(list, "$[1].changedBy.id"));
		assertTrue(((String) JsonPath.read(list, "$[1].changedBy.email")).startsWith("head-"));
		assertEquals(firstAt.toString(), JsonPath.read(list, "$[1].changedAt"));
		assertEquals(firstAt.plusSeconds(60).toString(), JsonPath.read(list, "$[0].changedAt"));
		assertEquals("Karim is unwell", JsonPath.read(list, "$[1].reason"), "trimmed");
		assertNull(JsonPath.read(list, "$[0].reason"));
		assertEquals(list, history(afternoon).getContentAsString(), "the afternoon run lists the same changes");
	}

	@Test
	void aChangeMadeByAnAccountThatNoLongerExistsHasANullEmail() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID gone = UUID.randomUUID();

		assertEquals(201, reassign(gone, t.run(), body(aSpare().driver(), t.bus().driverId(), null)).getStatus());

		String list = history(t.run()).getContentAsString();
		assertEquals(gone.toString(), JsonPath.read(list, "$[0].changedBy.id"));
		assertNull(JsonPath.read(list, "$[0].changedBy.email"));
	}

	@Test
	void aReasonIsAtMostTwoHundredCharactersAndBlankMeansNone() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare spare = aSpare();
		UUID head = aHeadAccount();

		MockHttpServletResponse tooLong = reassign(head, t.run(), body(spare.driver(), t.bus().driverId(), "x".repeat(201)));
		assertEquals(400, tooLong.getStatus(), tooLong.getContentAsString());
		assertNotNull(JsonPath.read(tooLong.getContentAsString(), "$.errors.reason"));
		assertEquals(0, changes(t.run()));
		assertEquals(t.bus().driverId().toString(), routeDriver(t.bus()), "nothing changed");

		assertEquals(201, reassign(head, t.run(), body(spare.driver(), t.bus().driverId(), "   ")).getStatus());
		assertNull(JsonPath.read(history(t.run()).getContentAsString(), "$[0].reason"), "blank is stored as none");

		Trip u = aStartedTrip("Verdun morning run");
		assertEquals(201, reassign(head, u.run(), body(aSpare().driver(), u.bus().driverId(), "x".repeat(200))).getStatus(),
				"200 characters are allowed");
	}

	// ---------------------------------------------------------------- who may do it

	@Test
	void onlyTheHeadOfTheSchoolMayReassignOrReadTheHistoryAndAnotherSchoolLearnsNothing() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare spare = aSpare();
		String json = body(spare.driver(), t.bus().driverId(), null);
		String url = HEAD_RUNS + "/" + t.run() + "/reassignments";

		for (Role role : List.of(Role.DRIVER, Role.PARENT, Role.ADMIN)) {
			assertEquals(403, send(post(url).with(as(role, UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
					.content(json)).getStatus(), role + " post");
			assertEquals(403, send(get(url).with(as(role, UUID.randomUUID()))).getStatus(), role + " get");
		}
		assertEquals(400, send(post(url).with(as(Role.PARENT, UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
				.content("{}")).getStatus(), "a body that cannot be used is a 400 before the role, as everywhere");
		assertEquals(401, send(post(url).contentType(MediaType.APPLICATION_JSON).content(json)).getStatus());
		assertEquals(401, send(get(url)).getStatus());

		MockHttpServletResponse otherPost = send(post(url).with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), UUID.randomUUID()))
				.contentType(MediaType.APPLICATION_JSON).content(json));
		MockHttpServletResponse otherGet = send(get(url).with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), UUID.randomUUID())));
		assertEquals(404, otherPost.getStatus(), "another school's head: the run does not exist for them");
		assertEquals(404, otherGet.getStatus());
		assertEquals(404, reassign(aHeadAccount(), UUID.randomUUID().toString(), json).getStatus(), "an unknown run, the same answer");
		assertEquals(otherPost.getContentAsString().replaceAll("\"instance\":\"[^\"]*\"", ""),
				reassign(aHeadAccount(), UUID.randomUUID().toString(), json).getContentAsString().replaceAll("\"instance\":\"[^\"]*\"", ""),
				"another school's run and an unknown run look the same");

		assertEquals(0, changes(t.run()), "none of that changed anything");
		assertEquals(t.bus().driverId().toString(), routeDriver(t.bus()));
	}

	@Test
	void aBodyWithoutBothDriversIsA400() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID head = aHeadAccount();
		MockHttpServletResponse noDriver = reassign(head, t.run(), "{\"fromDriverId\":\"" + t.bus().driverId() + "\"}");
		MockHttpServletResponse noFrom = reassign(head, t.run(), "{\"driverId\":\"" + aSpare().driver() + "\"}");
		assertEquals(400, noDriver.getStatus());
		assertNotNull(JsonPath.read(noDriver.getContentAsString(), "$.errors.driverId"));
		assertEquals(400, noFrom.getStatus());
		assertNotNull(JsonPath.read(noFrom.getContentAsString(), "$.errors.fromDriverId"));
		for (String bad : List.of("{}", "not json", "", "{\"driverId\":\"abc\",\"fromDriverId\":\"abc\"}")) {
			assertEquals(400, reassign(head, t.run(), bad).getStatus(), bad);
		}
		assertEquals(0, changes(t.run()));
	}

	// ---------------------------------------------------------------- the replacement and the preconditions

	@Test
	void theReplacementMustBeAnActiveFreeDriverOfTheSchoolAndAnyRefusalChangesNothing() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Trip other = aStartedTrip("Verdun morning run");
		UUID head = aHeadAccount();
		UUID from = t.bus().driverId();

		MockHttpServletResponse foreign = reassign(head, t.run(), body(aDriverWith(UUID.randomUUID(), DriverStatus.ACTIVE), from, null));
		MockHttpServletResponse unknown = reassign(head, t.run(), body(UUID.randomUUID(), from, null));
		MockHttpServletResponse deactivated = reassign(head, t.run(), body(aDriverWith(school, DriverStatus.DEACTIVATED), from, null));
		MockHttpServletResponse invited = reassign(head, t.run(), body(aDriverWith(school, DriverStatus.INVITED), from, null));
		MockHttpServletResponse busy = reassign(head, t.run(), body(other.bus().driverId(), from, null));

		assertEquals(404, foreign.getStatus(), "another school's driver");
		assertEquals(404, unknown.getStatus());
		assertEquals(409, deactivated.getStatus(), deactivated.getContentAsString());
		assertNotNull(JsonPath.read(deactivated.getContentAsString(), "$.errors.driverId"));
		assertEquals(409, invited.getStatus(), invited.getContentAsString());
		assertNotNull(JsonPath.read(invited.getContentAsString(), "$.errors.driverId"));
		assertEquals(409, busy.getStatus(), busy.getContentAsString());
		assertTrue(((String) JsonPath.read(busy.getContentAsString(), "$.errors.driverId")).contains("Verdun morning run"),
				"it names the route the driver is on: " + busy.getContentAsString());

		assertEquals(from.toString(), routeDriver(t.bus()), "no refusal changed the route");
		assertEquals(other.bus().driverId().toString(), routeDriver(other.bus()));
		assertEquals(0, changes(t.run()), "and none was recorded");
		assertEquals(2, todaysRuns(t.bus().driverUserId()), "the driver still has both runs");
	}

	@Test
	void fromDriverIdStopsTwoHeadsActingOnTheSameScreen() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare first = aSpare();
		Spare second = aSpare();
		assertEquals(201, reassign(aHeadAccount(), t.run(), body(first.driver(), t.bus().driverId(), null)).getStatus());

		MockHttpServletResponse stale = reassign(aHeadAccount(), t.run(), body(second.driver(), t.bus().driverId(), null));

		assertEquals(409, stale.getStatus(), stale.getContentAsString());
		assertTrue(((String) JsonPath.read(stale.getContentAsString(), "$.detail")).contains("Reload"), stale.getContentAsString());
		assertEquals(first.driver().toString(), routeDriver(t.bus()), "the first change stands");
		assertEquals(1, changes(t.run()));
	}

	@Test
	void askingForTheDriverTheRouteAlreadyHasIs200AndRecordsNothingSoARetryIsHarmless() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare spare = aSpare();
		String json = body(spare.driver(), t.bus().driverId(), null);

		assertEquals(201, reassign(aHeadAccount(), t.run(), json).getStatus());
		MockHttpServletResponse again = reassign(aHeadAccount(), t.run(), json);

		assertEquals(200, again.getStatus(), again.getContentAsString());
		assertEquals(spare.driver().toString(), JsonPath.read(again.getContentAsString(), "$.driver.id"));
		assertEquals(1, changes(t.run()), "nothing more was recorded");
	}

	@Test
	void onlyTodaysRunsThatAreNotFinishedAndNotOnAHolidayCanBeReassigned() throws Exception {
		Spare spare = aSpare();
		Trip finished = aStartedTrip("Hamra morning run");
		assertEquals(200, end(finished.bus(), finished.run()).getStatus());
		MockHttpServletResponse done = reassign(finished.run(), spare.driver(), finished.bus().driverId());
		assertEquals(409, done.getStatus(), done.getContentAsString());
		assertTrue(((String) JsonPath.read(done.getContentAsString(), "$.detail")).contains("FINISHED"), done.getContentAsString());

		Trip old = aStartedTrip("Verdun morning run");
		setNow(LocalDate.of(2026, 11, 5), LocalTime.of(7, 0));
		MockHttpServletResponse yesterday = reassign(old.run(), spare.driver(), old.bus().driverId());
		assertEquals(409, yesterday.getStatus(), "a run of an earlier day");
		assertEquals("Only today's runs can be reassigned.", JsonPath.read(yesterday.getContentAsString(), "$.detail"));

		setNow(LocalDate.of(2026, 11, 4), LocalTime.of(7, 0));
		Trip holiday = aStartedTrip("Achrafieh morning run");
		aHoliday(LocalDate.of(2026, 11, 4));
		assertEquals(409, reassign(holiday.run(), spare.driver(), holiday.bus().driverId()).getStatus(), "a holiday");

		assertEquals(finished.bus().driverId().toString(), routeDriver(finished.bus()));
		assertEquals(old.bus().driverId().toString(), routeDriver(old.bus()));
		assertEquals(holiday.bus().driverId().toString(), routeDriver(holiday.bus()));
	}

	@Test
	void aRunWhoseRouteWasDeletedIs404() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(204, send(delete(ROUTES + "/" + t.bus().routeId()).with(head())).getStatus());

		assertEquals(404, reassign(t.run(), aSpare().driver(), t.bus().driverId()).getStatus());
	}

	// ---------------------------------------------------------------- competing changes

	@Test
	void twoHeadsAskingForTheSameDriverAtOnceRecordOneChangeAndBothAreAnswered() throws Exception {
		for (int round = 0; round < 3; round++) {
			Trip t = aStartedTrip("Hamra morning run " + round);
			Spare spare = aSpare();
			String json = body(spare.driver(), t.bus().driverId(), null);

			List<Integer> statuses = together(List.of(
					() -> reassign(aHeadAccount(), t.run(), json).getStatus(),
					() -> reassign(aHeadAccount(), t.run(), json).getStatus()));

			assertTrue(statuses.contains(201) && statuses.contains(200), "one changes it, the other finds it done: " + statuses);
			assertEquals(1, changes(t.run()), "round " + round);
			assertEquals(spare.driver().toString(), routeDriver(t.bus()));
		}
	}

	@Test
	void twoHeadsChoosingDifferentReplacementsAtOnceLeaveExactlyOneWinnerAndOneRecord() throws Exception {
		for (int round = 0; round < 3; round++) {
			Trip t = aStartedTrip("Hamra morning run " + round);
			Spare a = aSpare();
			Spare b = aSpare();

			List<Integer> statuses = together(List.of(
					() -> reassign(aHeadAccount(), t.run(), body(a.driver(), t.bus().driverId(), null)).getStatus(),
					() -> reassign(aHeadAccount(), t.run(), body(b.driver(), t.bus().driverId(), null)).getStatus()));

			assertTrue(statuses.contains(201) && statuses.contains(409), "one wins, the other is refused: " + statuses);
			assertEquals(1, changes(t.run()), "no partial change, round " + round);
			UUID winner = statuses.get(0) == 201 ? a.driver() : b.driver();
			assertEquals(winner.toString(), routeDriver(t.bus()));
			assertEquals(winner.toString(), JsonPath.read(history(t.run()).getContentAsString(), "$[0].toDriver.id"),
					"the record names the driver the route has");
		}
	}

	@Test
	void oneSpareAskedForByTwoRoutesAtOnceEndsOnExactlyOneOfThem() throws Exception {
		for (int round = 0; round < 3; round++) {
			Trip x = aStartedTrip("Hamra morning run " + round);
			Trip y = aStartedTrip("Verdun morning run " + round);
			Spare spare = aSpare();

			List<Integer> statuses = together(List.of(
					() -> reassign(aHeadAccount(), x.run(), body(spare.driver(), x.bus().driverId(), null)).getStatus(),
					() -> reassign(aHeadAccount(), y.run(), body(spare.driver(), y.bus().driverId(), null)).getStatus()));

			assertTrue(statuses.contains(201) && statuses.contains(409), "one route gets them, the other is refused: " + statuses);
			int onRoutes = (spare.driver().toString().equals(routeDriver(x.bus())) ? 1 : 0)
					+ (spare.driver().toString().equals(routeDriver(y.bus())) ? 1 : 0);
			assertEquals(1, onRoutes, "a driver is on one route only, round " + round);
			assertEquals(1, changes(x.run()) + changes(y.run()), "and only that change is recorded");
		}
	}

	@Test
	void anOldDriversTapRacingTheChangeIsEitherRecordedBeforeItOrA404AndNeverBoth() throws Exception {
		for (int round = 0; round < 5; round++) {
			Trip t = aStartedTrip("Hamra morning run " + round);
			Spare spare = aSpare();

			List<Integer> statuses = together(List.of(
					() -> confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus(),
					() -> reassign(aHeadAccount(), t.run(), body(spare.driver(), t.bus().driverId(), null)).getStatus()));

			assertEquals(201, statuses.get(1));
			assertTrue(statuses.get(0) == 200 || statuses.get(0) == 404, "the tap: " + statuses.get(0));
			String seenByNewDriver = JsonPath.<List<String>>read(
					send(get(DRIVER_TODAY).with(as(Role.DRIVER, spare.user()))).getContentAsString(),
					"$.runs[?(@.id == '" + t.run() + "')].stops[?(@.studentId == '" + t.first() + "')].confirmation.status")
					.stream().findFirst().orElse(null);
			assertEquals(statuses.get(0) == 200 ? "PICKED_UP" : null, seenByNewDriver,
					"a 200 is a confirmation that exists, a 404 is none, round " + round);
			assertEquals(404, confirm(t.bus(), t.run(), t.second(), "PICKED_UP").getStatus(), "afterwards, always 404");
		}
	}

	// ---------------------------------------------------------------- with the live location (SCRUM-261)

	@Test
	void reassigningWithdrawsSharingSoTheNewDriverMustOptInAndTheOldPositionIsGone() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare spare = aSpare();
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), BEFORE_FIRST);
		assertEquals("LIVE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"));

		assertEquals(201, reassign(aHeadAccount(), t.run(), body(spare.driver(), t.bus().driverId(), null)).getStatus());

		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"),
				"the old driver's position is not shown as the new driver's");
		assertEquals(Boolean.FALSE, JsonPath.read(summaryOf(t.run()), "$.locationSharing"));
		assertEquals(404, position(t.bus().driverUserId(), t.run(), fixBody(FIRST)).getStatus(), "the old driver cannot send");
		assertEquals(404, shareBody(t.bus().driverUserId(), t.run(), "{\"enabled\":true}").getStatus(), "nor opt in");
		assertEquals(409, position(spare.user(), t.run(), fixBody(FIRST)).getStatus(),
				"consent belongs to the driver who gave it: the new driver has not consented");
		assertEquals(200, shareBody(spare.user(), t.run(), "{\"enabled\":true}").getStatus());
		assertEquals(204, position(spare.user(), t.run(), fixBody(BEFORE_FIRST)).getStatus());
		assertEquals("LIVE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"));
	}

	// ---------------------------------------------------------------- with the offline replay (SCRUM-263)

	@Test
	@EnabledIf("replayPresent")
	void aQueuedTapOfTheOldDriverIsA404EvenWithAKeyTheyUsedBeforeTheChange() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare spare = aSpare();
		String k = UUID.randomUUID().toString();
		String tap = "{\"status\":\"PICKED_UP\",\"clientRequestId\":\"" + k + "\"}";
		String url = "/api/driver/runs/" + t.run() + "/students/" + t.first() + "/confirmation";
		assertEquals(200, send(put(url).with(as(Role.DRIVER, t.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content(tap)).getStatus());

		assertEquals(201, reassign(aHeadAccount(), t.run(), body(spare.driver(), t.bus().driverId(), null)).getStatus());

		assertEquals(404, send(put(url).with(as(Role.DRIVER, t.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content(tap)).getStatus(), "never the 'already applied' 200: the old driver has lost the run");
		assertEquals(404, send(put("/api/driver/runs/" + t.run() + "/students/" + t.second() + "/confirmation")
				.with(as(Role.DRIVER, t.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"status\":\"PICKED_UP\",\"clientRequestId\":\"" + UUID.randomUUID() + "\"}")).getStatus());
		assertEquals(200, send(put(url).with(as(Role.DRIVER, spare.user())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"status\":\"PICKED_UP\",\"clientRequestId\":\"" + UUID.randomUUID() + "\"}")).getStatus(),
				"the new driver's own key for the same tap is fine");
		assertEquals(1, whole(JsonPath.read(summaryOf(t.run()), "$.counts.pickedUp")), "one record throughout");
	}

	// ---------------------------------------------------------------- the route edit, and the samples

	@Test
	void changingADriverThroughTheRouteEditIsStillRefusedMidRunAndIsNotInTheAuditAfterwards() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare spare = aSpare();
		String edit = "{\"name\":\"Hamra morning run\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}".formatted(t.bus().vehicleId(),
				spare.driver());

		MockHttpServletResponse midRun = send(put(ROUTES + "/" + t.bus().routeId()).with(head())
				.contentType(MediaType.APPLICATION_JSON).content(edit));
		assertEquals(409, midRun.getStatus(), midRun.getContentAsString());
		assertEquals(t.bus().driverId().toString(), routeDriver(t.bus()));

		assertEquals(200, end(t.bus(), t.run()).getStatus());
		MockHttpServletResponse after = send(put(ROUTES + "/" + t.bus().routeId()).with(head())
				.contentType(MediaType.APPLICATION_JSON).content(edit));
		assertEquals(200, after.getStatus(), after.getContentAsString());
		assertEquals(0, changes(t.run()), "a driver change through the route edit is not in the reassignment list");
	}

	@Test
	void theContractsSamplesHaveTheFieldsOfTheRealAnswers() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Spare spare = aSpare();
		String requestSample = Files.readString(Path.of("../docs/contracts/samples/runs/hot-reassign-request.json"));
		assertEquals(Set.of("driverId", "fromDriverId", "reason"), keys(requestSample, "$"));

		MockHttpServletResponse response = reassign(aHeadAccount(), t.run(), body(spare.driver(), t.bus().driverId(), "Karim is unwell"));
		assertEquals(201, response.getStatus());
		String runSample = Files.readString(Path.of("../docs/contracts/samples/runs/hot-reassign-run.json"));
		for (String path : List.of("$", "$.route", "$.vehicle", "$.driver", "$.counts")) {
			assertEquals(keys(runSample, path), keys(response.getContentAsString(), path), "hot-reassign-run.json " + path);
		}
		String listSample = Files.readString(Path.of("../docs/contracts/samples/runs/hot-reassignments.json"));
		String list = history(t.run()).getContentAsString();
		for (String path : List.of("$[0]", "$[0].fromDriver", "$[0].toDriver", "$[0].changedBy")) {
			assertEquals(keys(listSample, path), keys(list, path), "hot-reassignments.json " + path);
		}
	}
}
