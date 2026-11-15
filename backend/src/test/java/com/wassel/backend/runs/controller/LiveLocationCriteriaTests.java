package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.LiveRunCriteriaSupport;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.LocalDate;
import java.util.ArrayList;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-272, for SCRUM-261: the driver's live location, written from {@code docs/contracts/runs.md} "Live location" and
 * the ticket's acceptance criteria, not from {@code RunLocationTests} (the author's suite) or the code. Real app, real
 * repositories, the PostgreSQL container and every Flyway migration. The cases are the ones the pull request named as
 * worth attacking: the consent races, the parent's "still waiting" rule, the 60 and 300 second boundaries, and reads
 * across families and schools.
 */
class LiveLocationCriteriaTests extends LiveRunCriteriaSupport {

	private Boolean sharing(Bus bus, String run) throws Exception {
		List<Boolean> flags = JsonPath.read(driverToday(bus), "$.runs[?(@.id == '" + run + "')].locationSharing");
		assertEquals(1, flags.size());
		return flags.get(0);
	}

	private static boolean hasPosition(String body) {
		return JsonPath.read(body, "$.position") != null;
	}

	private static Set<String> keys(String json) {
		Map<String, Object> map = JsonPath.read(json, "$");
		return new TreeSet<>(map.keySet());
	}

	// ---------------------------------------------------------------- consent

	@Test
	void optingInNeedsTheRunInProgressAndWithdrawingWorksInAnyState() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, stopAt("Rami", aParent(), FIRST));
		String run = runId(bus, MORNING);

		assertEquals(409, share(bus, run, true).getStatus(), "not started");
		assertEquals(200, share(bus, run, false).getStatus(), "withdrawing is allowed before the start");
		assertEquals(200, start(bus, run).getStatus());
		MockHttpServletResponse optedIn = share(bus, run, true);
		assertEquals(200, optedIn.getStatus(), optedIn.getContentAsString());
		assertTrue(sharing(bus, run));

		assertEquals(200, end(bus, run).getStatus());
		assertEquals(409, share(bus, run, true).getStatus(), "finished");
		assertEquals(200, share(bus, run, false).getStatus(), "withdrawing is allowed after the end");
		assertFalse(sharing(bus, run));
	}

	@Test
	void optingInAgainChangesNothingWithdrawingTwiceIsFineAndAFreshOptInStartsEmpty() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), BEFORE_FIRST);

		assertEquals(200, share(t.bus(), t.run(), true).getStatus(), "opting in again while sharing");
		assertEquals("LIVE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"), "the position stays");

		assertEquals(200, share(t.bus(), t.run(), false).getStatus());
		assertEquals(200, share(t.bus(), t.run(), false).getStatus(), "withdrawing twice");
		assertFalse(sharing(t.bus(), t.run()));
		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"),
				"withdrawing removes the position at once");

		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"),
				"a fresh opt-in starts with no position, not with the old one");
	}

	@Test
	void anotherDriversRunAndAnUnknownRunAreA404ForEveryLocationWrite() throws Exception {
		Trip mine = aStartedTrip("Hamra morning run");
		Trip other = aStartedTrip("Verdun morning run");
		assertEquals(200, share(other.bus(), other.run(), true).getStatus());

		assertEquals(404, shareBody(mine.bus().driverUserId(), other.run(), "{\"enabled\":true}").getStatus());
		assertEquals(404, position(mine.bus().driverUserId(), other.run(), fixBody(FIRST)).getStatus());
		assertEquals(404, shareBody(mine.bus().driverUserId(), UUID.randomUUID().toString(), "{\"enabled\":true}")
				.getStatus());
		assertEquals(404, position(mine.bus().driverUserId(), UUID.randomUUID().toString(), fixBody(FIRST))
				.getStatus());
		assertEquals(404, shareBody(mine.bus().driverUserId(), other.run(), "{\"enabled\":false}").getStatus(),
				"also a withdrawal of somebody else's consent");
		assertTrue(sharing(other.bus(), other.run()), "and it changed nothing");
	}

	// ---------------------------------------------------------------- sending positions

	@Test
	void aPositionNeedsConsentAndARunInProgress() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");

		assertEquals(409, position(t.bus().driverUserId(), t.run(), fixBody(FIRST)).getStatus(), "not sharing");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		assertEquals(204, position(t.bus().driverUserId(), t.run(), fixBody(FIRST)).getStatus());
		assertEquals(200, share(t.bus(), t.run(), false).getStatus());
		assertEquals(409, position(t.bus().driverUserId(), t.run(), fixBody(FIRST)).getStatus(),
				"a late position after a withdrawal is refused");
		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"),
				"and never brings the position back");

		Bus idle = aBus("Verdun morning run");
		onRoute(idle, stopAt("Salma", aParent(), SECOND));
		assertEquals(409, position(idle.driverUserId(), runId(idle, MORNING), fixBody(FIRST)).getStatus(),
				"a run that has not started");
	}

	@Test
	void theLimitsOfAPositionAreInclusiveAndAnythingOutsideOrMissingIs400AndNeverStored() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		UUID driver = t.bus().driverUserId();

		for (String allowed : List.of(
				"{\"latitude\":90,\"longitude\":180,\"accuracyMeters\":0}",
				"{\"latitude\":-90,\"longitude\":-180,\"accuracyMeters\":10000}",
				"{\"latitude\":0,\"longitude\":0,\"accuracyMeters\":9999.9}")) {
			assertEquals(204, position(driver, t.run(), allowed).getStatus(), allowed);
		}
		assertEquals(200, share(t.bus(), t.run(), false).getStatus());
		assertEquals(200, share(t.bus(), t.run(), true).getStatus(), "start again with no position");

		List<String> accepted = new ArrayList<>();
		for (String refused : List.of(
				"{\"latitude\":90.000001,\"longitude\":0,\"accuracyMeters\":5}",
				"{\"latitude\":-90.000001,\"longitude\":0,\"accuracyMeters\":5}",
				"{\"latitude\":0,\"longitude\":180.000001,\"accuracyMeters\":5}",
				"{\"latitude\":0,\"longitude\":-180.000001,\"accuracyMeters\":5}",
				"{\"latitude\":0,\"longitude\":0,\"accuracyMeters\":-0.001}",
				"{\"latitude\":0,\"longitude\":0,\"accuracyMeters\":10000.001}",
				"{\"longitude\":0,\"accuracyMeters\":5}",
				"{\"latitude\":0,\"accuracyMeters\":5}",
				"{\"latitude\":0,\"longitude\":0}",
				"{\"latitude\":null,\"longitude\":0,\"accuracyMeters\":5}",
				"{\"latitude\":true,\"longitude\":0,\"accuracyMeters\":5}",
				"{\"latitude\":[33.9],\"longitude\":0,\"accuracyMeters\":5}",
				"{\"latitude\":1e999,\"longitude\":0,\"accuracyMeters\":5}",
				"{\"latitude\":NaN,\"longitude\":0,\"accuracyMeters\":5}",
				"{}", "[]", "not json", "")) {
			MockHttpServletResponse response = position(driver, t.run(), refused);
			if (response.getStatus() != 400) {
				accepted.add(refused + " -> " + response.getStatus());
			}
		}
		assertEquals(List.of(), accepted, "positions that were not refused with a 400");
		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"),
				"a position the server did not accept is never stored");
	}

	@Test
	void onlyTheServersClockDecidesHowOldAPositionIs() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());

		MockHttpServletResponse response = position(t.bus().driverUserId(), t.run(),
				"{\"latitude\":%s,\"longitude\":%s,\"accuracyMeters\":5,\"receivedAt\":\"2000-01-01T00:00:00Z\",\"timestamp\":0,\"time\":\"2000-01-01T00:00:00Z\"}"
						.formatted(BEFORE_FIRST, LONGITUDE));

		assertTrue(response.getStatus() == 204 || response.getStatus() == 400, "" + response.getStatus());
		if (response.getStatus() == 204) {
			String body = parentSees(t.parentOfFirst(), t.first());
			assertEquals("LIVE", JsonPath.read(body, "$.status"), "a time sent by the phone is never read");
			assertEquals(0, whole(JsonPath.read(body, "$.position.ageSeconds")));
			assertEquals(clock.instant().toString(), JsonPath.read(body, "$.position.receivedAt"));
		}
	}

	@Test
	void theLatestPositionReplacesTheLastOne() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), 33.80);
		later(5);
		fix(t.bus(), t.run(), 33.85);

		String body = parentSees(t.parentOfFirst(), t.first());
		assertEquals(33.85, JsonPath.<Double>read(body, "$.position.latitude"));
		assertEquals(0, whole(JsonPath.read(body, "$.position.ageSeconds")), "its age counts from the latest one");
	}

	// ---------------------------------------------------------------- freshness

	@Test
	void aPositionIsLiveUpToSixtySecondsStaleUpToFiveMinutesThenGone() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), BEFORE_FIRST);

		for (int[] step : new int[][] { { 60, 0 }, { 1, 1 }, { 239, 1 }, { 1, 2 } }) {
			later(step[0]);
			String body = parentSees(t.parentOfFirst(), t.first());
			String head = headSeesPositions();
			long age = (long) clock.instant().getEpochSecond();
			if (step[1] == 0) {
				assertEquals("LIVE", JsonPath.read(body, "$.status"), "60 seconds is still live");
				assertEquals(60, whole(JsonPath.read(body, "$.position.ageSeconds")));
				assertEquals("LIVE", positionOf(head, t.run(), ".status"));
			}
			else if (step[1] == 1) {
				assertEquals("STALE", JsonPath.read(body, "$.status"), "61 up to 300 seconds is stale (age " + age + ")");
				assertNotNull(JsonPath.read(body, "$.position"), "the last known position is still shown");
				assertEquals("STALE", positionOf(head, t.run(), ".status"));
			}
			else {
				assertEquals("UNAVAILABLE", JsonPath.read(body, "$.status"), "301 seconds is not shown any more");
				assertNull(JsonPath.read(body, "$.position"));
				assertEquals("UNAVAILABLE", positionOf(head, t.run(), ".status"));
				assertNull(positionOf(head, t.run(), ".position"));
			}
		}
		// Exactly 300 seconds is still shown: go back to it with a fresh position and walk to that second.
		fix(t.bus(), t.run(), BEFORE_FIRST);
		later(300);
		assertEquals("STALE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"), "300 seconds");
		assertEquals(300, whole(JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.position.ageSeconds")));
	}

	// ---------------------------------------------------------------- what a parent sees

	@Test
	void aParentSeesThePositionOnlyWhileTheirChildIsStillWaiting() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), BEFORE_FIRST);
		for (UUID[] pair : List.of(new UUID[] { t.parentOfFirst(), t.first() }, new UUID[] { t.parentOfSecond(), t.second() },
				new UUID[] { t.parentOfThird(), t.third() })) {
			assertEquals("LIVE", JsonPath.read(parentSees(pair[0], pair[1]), "$.status"));
		}

		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());
		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"),
				"picked up: the map ends, on purpose");
		assertEquals("LIVE", JsonPath.read(parentSees(t.parentOfSecond(), t.second()), "$.status"),
				"the next child still sees it");

		assertEquals(200, confirm(t.bus(), t.run(), t.second(), "NOT_PRESENT").getStatus());
		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfSecond(), t.second()), "$.status"),
				"not at the stop: skipped");

		absentToday(t.parentOfThird(), t.third());
		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfThird(), t.third()), "$.status"),
				"absent today: a parent never watches the bus go to other families");
	}

	@Test
	void everyReasonForNothingToShowLooksTheSameSoTheParentNeverLearnsWhy() throws Exception {
		List<String> answers = new ArrayList<>();

		Trip sharingOff = aStartedTrip("Hamra morning run");
		answers.add(parentSees(sharingOff.parentOfFirst(), sharingOff.first()));

		Trip noPositionYet = aStartedTrip("Verdun morning run");
		assertEquals(200, share(noPositionYet.bus(), noPositionYet.run(), true).getStatus());
		answers.add(parentSees(noPositionYet.parentOfFirst(), noPositionYet.first()));

		Trip tooOld = aStartedTrip("Achrafieh morning run");
		assertEquals(200, share(tooOld.bus(), tooOld.run(), true).getStatus());
		fix(tooOld.bus(), tooOld.run(), BEFORE_FIRST);

		Bus idle = aBus("Mar Mikhael morning run");
		UUID idleParent = aParent();
		UUID idleChild = stopAt("Idle", idleParent, FIRST);
		onRoute(idle, idleChild);
		runId(idle, MORNING);
		answers.add(parentSees(idleParent, idleChild));

		UUID noRouteParent = aParent();
		UUID noRoute = stopAt("Lost", noRouteParent, FIRST);
		answers.add(parentSees(noRouteParent, noRoute));

		later(301);
		answers.add(parentSees(tooOld.parentOfFirst(), tooOld.first()));

		aHoliday(LocalDate.of(2026, 11, 4));
		answers.add(parentSees(sharingOff.parentOfSecond(), sharingOff.second()));

		Set<String> expected = keys(answers.get(0));
		assertTrue(expected.contains("status") && expected.contains("position"), expected.toString());
		for (String answer : answers) {
			assertEquals("UNAVAILABLE", JsonPath.read(answer, "$.status"), answer);
			assertNull(JsonPath.read(answer, "$.position"), answer);
			assertEquals(expected, keys(answer), "the same fields, with no reason: " + answer);
			assertFalse(answer.toLowerCase().contains("reason"), answer);
		}
	}

	@Test
	void aParentCannotReadAnotherFamilysChildNorAnotherSchoolsNorAnUnknownOne() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), BEFORE_FIRST);

		for (MockHttpServletResponse response : List.of(parentReads(t.parentOfSecond(), t.first()),
				parentReads(aParent(), t.first()), parentReads(t.parentOfFirst(), UUID.fromString(
						"00000000-0000-4000-8000-0000000000aa")))) {
			assertEquals(404, response.getStatus());
			assertFalse(response.getContentAsString().contains("latitude"), "no position in a 404");
		}
		MockHttpServletResponse elsewhere = send(get("/api/parent/children/" + t.first() + "/bus-location")
				.with(as(Role.PARENT, t.parentOfFirst(), UUID.randomUUID())));
		assertEquals(404, elsewhere.getStatus(), "the same parent id in another school");
	}

	// ---------------------------------------------------------------- what the head sees

	@Test
	void theHeadSeesEveryRunInProgressOfTheirSchoolAndNothingElse() throws Exception {
		Trip sharing = aStartedTrip("Hamra morning run");
		assertEquals(200, share(sharing.bus(), sharing.run(), true).getStatus());
		fix(sharing.bus(), sharing.run(), BEFORE_FIRST);
		Trip silent = aStartedTrip("Verdun morning run");
		Trip finished = aStartedTrip("Achrafieh morning run");
		assertEquals(200, end(finished.bus(), finished.run()).getStatus());
		Bus idle = aBus("Mar Mikhael morning run");
		onRoute(idle, stopAt("Idle", aParent(), FIRST));
		String notStarted = runId(idle, MORNING);

		String list = headSeesPositions();

		assertEquals("LIVE", positionOf(list, sharing.run(), ".status"));
		assertEquals("UNAVAILABLE", positionOf(list, silent.run(), ".status"));
		assertFalse(listsRun(list, finished.run()), "a finished run");
		assertFalse(listsRun(list, notStarted), "a run that has not started");
		assertEquals(2, ((List<?>) JsonPath.read(list, "$")).size());
		assertTrue(sharing(sharing.bus(), sharing.run()));
		assertFalse(sharing(silent.bus(), silent.run()), "UNAVAILABLE with sharing false means not sharing");
		assertEquals(Boolean.TRUE, JsonPath.read(summaryOf(sharing.run()), "$.locationSharing"));
		assertEquals(Boolean.FALSE, JsonPath.read(summaryOf(silent.run()), "$.locationSharing"));

		assertEquals(200, share(silent.bus(), silent.run(), true).getStatus());
		assertEquals("UNAVAILABLE", positionOf(headSeesPositions(), silent.run(), ".status"),
				"UNAVAILABLE with sharing true means no fresh position");
		assertEquals(Boolean.TRUE, JsonPath.read(summaryOf(silent.run()), "$.locationSharing"));

		MockHttpServletResponse other = send(get(HEAD_RUNS + "/locations")
				.with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), UUID.randomUUID())));
		assertEquals(200, other.getStatus());
		assertEquals("[]", other.getContentAsString().replace(" ", ""), "another school's head sees none of these");
	}

	@Test
	void aHolidayHasNoPositionsToShow() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), BEFORE_FIRST);
		aHoliday(LocalDate.of(2026, 11, 4));

		assertEquals("[]", headSeesPositions().replace(" ", ""));
		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"));
	}

	// ---------------------------------------------------------------- ending, and the races

	@Test
	void endingARunWithdrawsConsentAndRemovesThePositionInTheSameStep() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), BEFORE_FIRST);

		assertEquals(200, end(t.bus(), t.run()).getStatus());

		assertFalse(sharing(t.bus(), t.run()));
		assertEquals(Boolean.FALSE, JsonPath.read(summaryOf(t.run()), "$.locationSharing"));
		assertFalse(listsRun(headSeesPositions(), t.run()));
		assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"));
		assertEquals(409, position(t.bus().driverUserId(), t.run(), fixBody(FIRST)).getStatus());
	}

	@Test
	void optingInRacingTheEndNeverLeavesSharingOnForAFinishedRun() throws Exception {
		for (int round = 0; round < 5; round++) {
			Trip t = aStartedTrip("Hamra morning run " + round);
			List<Integer> statuses = together(List.of(
					() -> share(t.bus(), t.run(), true).getStatus(),
					() -> end(t.bus(), t.run()).getStatus()));

			assertEquals(200, statuses.get(1), "the end always succeeds, round " + round);
			assertTrue(statuses.get(0) == 200 || statuses.get(0) == 409, "opt-in: " + statuses.get(0));
			assertEquals("FINISHED", JsonPath.read(summaryOf(t.run()), "$.state"));
			assertFalse(sharing(t.bus(), t.run()), "sharing is off for a finished run, round " + round);
			assertFalse(listsRun(headSeesPositions(), t.run()));
			assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"));
		}
	}

	@Test
	void aPositionRacingAWithdrawalNeverBringsThePositionBack() throws Exception {
		for (int round = 0; round < 5; round++) {
			Trip t = aStartedTrip("Hamra morning run " + round);
			assertEquals(200, share(t.bus(), t.run(), true).getStatus());
			fix(t.bus(), t.run(), BEFORE_FIRST);

			List<Integer> statuses = together(List.of(
					() -> position(t.bus().driverUserId(), t.run(), fixBody(FIRST)).getStatus(),
					() -> share(t.bus(), t.run(), false).getStatus()));

			assertEquals(200, statuses.get(1));
			assertTrue(statuses.get(0) == 204 || statuses.get(0) == 409, "position: " + statuses.get(0));
			assertFalse(sharing(t.bus(), t.run()));
			assertEquals("UNAVAILABLE", JsonPath.read(parentSees(t.parentOfFirst(), t.first()), "$.status"),
					"the withdrawal wins whichever came first, round " + round);
			assertFalse(hasPosition(parentSees(t.parentOfFirst(), t.first())));
		}
	}

	// ---------------------------------------------------------------- who may call what

	@Test
	void everyEndpointIsForItsOwnRoleOnly() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		String sharingUrl = "/api/driver/runs/" + t.run() + "/location-sharing";
		String locationUrl = "/api/driver/runs/" + t.run() + "/location";
		for (Role role : List.of(Role.PARENT, Role.HEAD_OF_TRANSPORT, Role.ADMIN)) {
			assertEquals(403, send(put(sharingUrl).with(as(role, UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
					.content("{\"enabled\":true}")).getStatus(), role + " sharing");
			assertEquals(403, send(put(locationUrl).with(as(role, UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
					.content(fixBody(FIRST))).getStatus(), role + " position");
		}
		String childUrl = "/api/parent/children/" + t.first() + "/bus-location";
		for (Role role : List.of(Role.DRIVER, Role.HEAD_OF_TRANSPORT, Role.ADMIN)) {
			assertEquals(403, send(get(childUrl).with(as(role, UUID.randomUUID()))).getStatus(), role + " child");
		}
		for (Role role : List.of(Role.DRIVER, Role.PARENT, Role.ADMIN)) {
			assertEquals(403, send(get(HEAD_RUNS + "/locations").with(as(role, UUID.randomUUID()))).getStatus(), role + " head");
		}
		assertEquals(401, send(put(sharingUrl).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}")).getStatus());
		assertEquals(401, send(put(locationUrl).contentType(MediaType.APPLICATION_JSON).content(fixBody(FIRST))).getStatus());
		assertEquals(401, send(get(childUrl)).getStatus());
		assertEquals(401, send(get(HEAD_RUNS + "/locations")).getStatus());
	}

	@Test
	void theOptInBodyMustBeABoolean() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		List<String> accepted = new ArrayList<>();
		for (String refused : List.of("{}", "{\"enabled\":null}", "{\"enabled\":\"yes\"}", "{\"enabled\":[true]}",
				"not json", "")) {
			MockHttpServletResponse response = shareBody(t.bus().driverUserId(), t.run(), refused);
			if (response.getStatus() != 400) {
				accepted.add(refused + " -> " + response.getStatus());
			}
		}
		assertEquals(List.of(), accepted, "consent bodies that were not refused with a 400");
		assertFalse(sharing(t.bus(), t.run()), "consent is never given by a body that is not a clear yes");
	}

	// ---------------------------------------------------------------- known finding, off in CI (BUG-1 in SCRUM-272-bugs.md)

	/**
	 * Jackson converts a text or a 1 into the number or boolean the field wants, so the contract's "all finite numbers" and
	 * the ticket's "explicit opt-in" do not hold for these bodies. Run with {@code -Dknown-bug.SCRUM-261-coercion=true}.
	 */
	@Test
	@EnabledIfSystemProperty(named = "known-bug.SCRUM-261-coercion", matches = "true")
	void aTextForANumberAndATextOrANumberForConsentAreRefusedNotConverted() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		List<String> accepted = new ArrayList<>();
		for (String body : List.of("{\"enabled\":\"true\"}", "{\"enabled\":1}")) {
			MockHttpServletResponse response = shareBody(driver, t.run(), body);
			if (response.getStatus() != 400) {
				accepted.add("consent " + body + " -> " + response.getStatus());
			}
		}
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		for (String body : List.of("{\"latitude\":\"33.9\",\"longitude\":0,\"accuracyMeters\":5}",
				"{\"latitude\":0,\"longitude\":\"35.5\",\"accuracyMeters\":5}",
				"{\"latitude\":0,\"longitude\":0,\"accuracyMeters\":\"5\"}")) {
			MockHttpServletResponse response = position(driver, t.run(), body);
			if (response.getStatus() != 400) {
				accepted.add("position " + body + " -> " + response.getStatus());
			}
		}
		assertEquals(List.of(), accepted, "bodies of the wrong type that were not refused with a 400");
	}
}
