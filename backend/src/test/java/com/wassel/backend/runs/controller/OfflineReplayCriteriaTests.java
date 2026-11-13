package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.LiveRunCriteriaSupport;
import com.wassel.backend.common.PendingFeature;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-272, for SCRUM-263: the offline confirmation replay, written from {@code docs/contracts/runs.md} "Offline replay
 * and {@code clientRequestId}" (its numbered rules and the table of answers) and the ticket's acceptance criteria, not from
 * {@code ConfirmationReplayTests} (the author's suite) or the code. Real app, PostgreSQL, every migration. A replay is an
 * ordinary {@code PUT .../confirmation} with a key, so every observation is an HTTP answer: the driver's own day, the head's
 * counts and the parent's inbox.
 *
 * <p>On {@code develop} this suite is off until the pull request that adds the feature merges ({@link PendingFeature}).
 */
@EnabledIf("pending")
class OfflineReplayCriteriaTests extends LiveRunCriteriaSupport {

	static boolean pending() {
		return PendingFeature.present("SCRUM-263", "com.wassel.backend.runs.entity.ConfirmationKey");
	}

	private static String key() {
		return UUID.randomUUID().toString();
	}

	private MockHttpServletResponse tap(UUID driverUser, String run, UUID student, String status, String key)
			throws Exception {
		String body = key == null ? "{\"status\":\"%s\"}".formatted(status)
				: "{\"status\":\"%s\",\"clientRequestId\":\"%s\"}".formatted(status, key);
		return rawTap(driverUser, run, student, body);
	}

	private MockHttpServletResponse rawTap(UUID driverUser, String run, UUID student, String body) throws Exception {
		return send(put("/api/driver/runs/" + run + "/students/" + student + "/confirmation")
				.with(as(Role.DRIVER, driverUser)).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	/** The stop of this student on the driver's own copy of the run, as the driver sees it now. */
	private Map<String, Object> stopOf(Bus bus, String run, UUID student) throws Exception {
		List<Map<String, Object>> stops = JsonPath.read(driverToday(bus), "$.runs[?(@.id == '" + run + "')].stops[*]");
		return stops.stream().filter(stop -> student.toString().equals(stop.get("studentId"))).findFirst().orElseThrow();
	}

	@SuppressWarnings("unchecked")
	private String statusOf(Bus bus, String run, UUID student) throws Exception {
		Map<String, Object> confirmation = (Map<String, Object>) stopOf(bus, run, student).get("confirmation");
		return confirmation == null ? null : (String) confirmation.get("status");
	}

	@SuppressWarnings("unchecked")
	private String timeOf(Bus bus, String run, UUID student) throws Exception {
		return (String) ((Map<String, Object>) stopOf(bus, run, student).get("confirmation")).get("at");
	}

	private int pickedUp(String run) throws Exception {
		return whole(JsonPath.read(summaryOf(run), "$.counts.pickedUp"));
	}

	/**
	 * The parent's inbox entries, or -1 where there is no inbox yet: the contract promises one entry per tap "once the parent
	 * inbox lands" (SCRUM-267), so on a branch without it the entry is not asserted.
	 */
	private int inboxEntries(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get("/api/parent/inbox").with(as(Role.PARENT, parent)));
		return response.getStatus() == 200 ? ((List<?>) JsonPath.read(response.getContentAsString(), "$")).size() : -1;
	}

	private void assertOneInboxEntry(UUID parent) throws Exception {
		int entries = inboxEntries(parent);
		if (entries >= 0) {
			assertEquals(1, entries, "one inbox entry for one tap");
		}
	}

	// ---------------------------------------------------------------- one business effect

	@Test
	void theSameKeyForTheSameTapIsRecordedOnceAndAnsweredWithTheRunEveryTime() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		String k = key();

		MockHttpServletResponse first = tap(driver, t.run(), t.first(), "PICKED_UP", k);
		assertEquals(200, first.getStatus(), first.getContentAsString());
		String recordedAt = timeOf(t.bus(), t.run(), t.first());
		for (int retry = 0; retry < 3; retry++) {
			later(60);
			MockHttpServletResponse again = tap(driver, t.run(), t.first(), "PICKED_UP", k);
			assertEquals(200, again.getStatus(), "retry " + retry + ": " + again.getContentAsString());
			assertEquals(t.run(), JsonPath.read(again.getContentAsString(), "$.id"), "the answer is the run");
		}

		assertEquals(recordedAt, timeOf(t.bus(), t.run(), t.first()), "the first time is kept");
		assertEquals(1, pickedUp(t.run()), "one record, one step of progress");
		assertOneInboxEntry(t.parentOfFirst());
	}

	@Test
	void aDoubleTapMadeOfflineTwoKeysForOneTapLeavesOneRecordAndOneEntry() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		String k1 = key();
		String k2 = key();

		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k1).getStatus());
		String recordedAt = timeOf(t.bus(), t.run(), t.first());
		later(30);
		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k2).getStatus(), "the second key of the same tap");

		assertEquals(recordedAt, timeOf(t.bus(), t.run(), t.first()));
		assertEquals(1, pickedUp(t.run()));
		assertOneInboxEntry(t.parentOfFirst());
		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k1).getStatus(), "and either key may be replayed");
		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k2).getStatus());
	}

	@Test
	void aKeyAlreadyAppliedAnswers200EvenAfterALaterStatusAndNeverMovesTheStudentBack() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		String k = key();
		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus());
		assertEquals(200, tap(driver, t.run(), t.first(), "DROPPED_OFF", null).getStatus());

		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus(),
				"a retry that arrives after the next tap is not a mistake");

		assertEquals("DROPPED_OFF", statusOf(t.bus(), t.run(), t.first()));
	}

	@Test
	void parallelRequestsWithOneKeyMakeOneRecordAndAreAll200() throws Exception {
		for (int round = 0; round < 3; round++) {
			Trip t = aStartedTrip("Hamra morning run " + round);
			UUID driver = t.bus().driverUserId();
			String k = key();

			List<Integer> statuses = together(List.of(
					() -> tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus(),
					() -> tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus(),
					() -> tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus(),
					() -> tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus(),
					() -> tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus(),
					() -> tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus()));

			assertEquals(List.of(200, 200, 200, 200, 200, 200), statuses, "round " + round);
			assertEquals(1, pickedUp(t.run()));
			assertOneInboxEntry(t.parentOfFirst());
		}
	}

	@Test
	void parallelRequestsWithDifferentKeysForOneTapAreAll200AndMakeOneRecord() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();

		List<Integer> statuses = together(List.of(
				() -> tap(driver, t.run(), t.first(), "PICKED_UP", key()).getStatus(),
				() -> tap(driver, t.run(), t.first(), "PICKED_UP", key()).getStatus(),
				() -> tap(driver, t.run(), t.first(), "PICKED_UP", key()).getStatus(),
				() -> tap(driver, t.run(), t.first(), "PICKED_UP", key()).getStatus()));

		assertEquals(List.of(200, 200, 200, 200), statuses);
		assertEquals(1, pickedUp(t.run()));
		assertOneInboxEntry(t.parentOfFirst());
	}

	// ---------------------------------------------------------------- a key used for something else

	@Test
	void aKeyReusedForADifferentStatusStudentOrRunIs422AndChangesNothing() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		String afternoon = runId(t.bus(), AFTERNOON);
		String k = key();
		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus());

		for (MockHttpServletResponse reused : List.of(
				tap(driver, t.run(), t.first(), "NOT_PRESENT", k),
				tap(driver, t.run(), t.first(), "DROPPED_OFF", k),
				tap(driver, t.run(), t.second(), "PICKED_UP", k),
				tap(driver, afternoon, t.first(), "PICKED_UP", k))) {
			assertEquals(422, reused.getStatus(), reused.getContentAsString());
			assertTrue(((String) JsonPath.read(reused.getContentAsString(), "$.detail")).contains("clientRequestId"),
					reused.getContentAsString());
		}

		assertEquals("PICKED_UP", statusOf(t.bus(), t.run(), t.first()), "the first tap stands");
		assertNull(statusOf(t.bus(), t.run(), t.second()), "and the reused key recorded nothing for anybody else");
		assertEquals(1, pickedUp(t.run()));
		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus(), "the original is still applied");
	}

	@Test
	void theKeyOfAnotherTapWinsOnlyOnceWhenTwoDifferentTapsRaceForOneKey() throws Exception {
		for (int round = 0; round < 4; round++) {
			Trip t = aStartedTrip("Hamra morning run " + round);
			UUID driver = t.bus().driverUserId();
			String k = key();

			List<Integer> statuses = together(List.of(
					() -> tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus(),
					() -> tap(driver, t.run(), t.second(), "PICKED_UP", k).getStatus()));

			assertTrue(statuses.contains(200) && statuses.contains(422), "one wins, one is refused: " + statuses);
			int recorded = (statusOf(t.bus(), t.run(), t.first()) == null ? 0 : 1)
					+ (statusOf(t.bus(), t.run(), t.second()) == null ? 0 : 1);
			assertEquals(1, recorded, "the refused tap left no record, round " + round);
			assertEquals(1, pickedUp(t.run()));
		}
	}

	@Test
	void aKeyBelongsToOneDriverAndTwoDriversMayUseTheSameValue() throws Exception {
		Trip a = aStartedTrip("Hamra morning run");
		Trip b = aStartedTrip("Verdun morning run");
		String k = key();

		assertEquals(200, tap(a.bus().driverUserId(), a.run(), a.first(), "PICKED_UP", k).getStatus());
		assertEquals(200, tap(b.bus().driverUserId(), b.run(), b.first(), "PICKED_UP", k).getStatus(),
				"the same value from another driver is their own key");
		assertEquals("PICKED_UP", statusOf(a.bus(), a.run(), a.first()));
		assertEquals("PICKED_UP", statusOf(b.bus(), b.run(), b.first()));

		MockHttpServletResponse trespass = tap(b.bus().driverUserId(), a.run(), a.second(), "PICKED_UP", k);
		assertEquals(404, trespass.getStatus(), "another driver's run is a 404 before any key is looked at");
		assertNull(statusOf(a.bus(), a.run(), a.second()));
	}

	// ---------------------------------------------------------------- order of checks, and what a refusal keeps

	@Test
	void theRunIsCheckedBeforeTheKeyAndARefusedRequestStoresNoKey() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		Bus idle = aBus("Verdun morning run");
		UUID child = stopAt("Salma", aParent(), SECOND);
		onRoute(idle, child);
		String notStarted = runId(idle, MORNING);
		UUID driver = idle.driverUserId();
		String k = key();

		MockHttpServletResponse early = tap(driver, notStarted, child, "PICKED_UP", k);
		assertEquals(409, early.getStatus(), "a run that has not started");
		assertEquals(200, start(idle, notStarted).getStatus());
		assertEquals(200, tap(driver, notStarted, child, "PICKED_UP", k).getStatus(),
				"the same key is judged afresh against the state now: nothing was stored by the 409");

		String k2 = key();
		assertEquals(404, tap(driver, notStarted, UUID.randomUUID(), "PICKED_UP", k2).getStatus(), "a student not on the run");
		assertEquals(200, tap(driver, notStarted, child, "DROPPED_OFF", k2).getStatus(), "the 404 stored no key either");
		assertEquals(404, tap(t.bus().driverUserId(), notStarted, child, "PICKED_UP", key()).getStatus());
	}

	@Test
	void tapsReplayedOutOfOrderAreJudgedByTheTransitionTableAndTheLostOnesCanBeSentAgain() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		String pickUp = key();
		String dropOff = key();

		assertEquals(409, tap(driver, t.run(), t.first(), "DROPPED_OFF", dropOff).getStatus(), "no pick-up yet");
		assertNull(statusOf(t.bus(), t.run(), t.first()));
		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", pickUp).getStatus());
		assertEquals(200, tap(driver, t.run(), t.first(), "DROPPED_OFF", dropOff).getStatus(),
				"the 409 stored no key, so the same item is sent again and now counts");
		assertEquals("DROPPED_OFF", statusOf(t.bus(), t.run(), t.first()));
		assertEquals(409, tap(driver, t.run(), t.first(), "NOT_PRESENT", key()).getStatus(), "the table still refuses a regress");
	}

	@Test
	void afterTheRunEndsAnOldKeyStillAnswers200ButANewKeyForARecordedStatusIs409() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		String k = key();
		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus());
		String recordedAt = timeOf(t.bus(), t.run(), t.first());
		assertEquals(200, end(t.bus(), t.run()).getStatus());

		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", k).getStatus(), "this key was already applied");
		assertEquals(409, tap(driver, t.run(), t.first(), "PICKED_UP", key()).getStatus(),
				"a new key after the end is a 409 like any confirmation, though the status is recorded");
		assertEquals(409, tap(driver, t.run(), t.second(), "PICKED_UP", key()).getStatus());
		assertEquals(recordedAt, timeOf(t.bus(), t.run(), t.first()));
		assertNull(statusOf(t.bus(), t.run(), t.second()));
	}

	@Test
	void aRunFromAnEarlierDayIs404EvenForAKeyThatWasApplied() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		String k = key();
		assertEquals(200, tap(t.bus().driverUserId(), t.run(), t.first(), "PICKED_UP", k).getStatus());

		setNow(LocalDate.of(2026, 11, 5), LocalTime.of(7, 0));

		assertEquals(404, tap(t.bus().driverUserId(), t.run(), t.first(), "PICKED_UP", k).getStatus(),
				"the client drops earlier-day items without sending them; if it does send one it is a 404");
	}

	// ---------------------------------------------------------------- the time, the body and the roles

	@Test
	void aReplayedTapIsTimedWhenItArrivesAndNeverByAClientTime() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		later(600);
		Instant arrives = clock.instant();

		MockHttpServletResponse response = rawTap(driver, t.run(), t.first(),
				"{\"status\":\"PICKED_UP\",\"clientRequestId\":\"%s\",\"at\":\"2000-01-01T00:00:00Z\",\"confirmedAt\":\"2000-01-01T00:00:00Z\"}"
						.formatted(key()));

		assertTrue(response.getStatus() == 200 || response.getStatus() == 400, "" + response.getStatus());
		if (response.getStatus() == 200) {
			assertEquals(arrives.toString(), timeOf(t.bus(), t.run(), t.first()), "the time is the server's, at arrival");
		}
	}

	@Test
	void aKeyThatIsNotAUuidIsA400AndRecordsNothing() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		List<String> notRefused = new ArrayList<>();

		for (String bad : List.of("\"\"", "\" \"", "\"abc\"", "\"6f1c2a4e8b3d4e5f9a7b1c2d3e4f5a6b\"", "5", "true",
				"[\"6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b\"]", "{}", "\"6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b-extra\"",
				"\"{6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b}\"")) {
			MockHttpServletResponse response = rawTap(driver, t.run(), t.first(),
					"{\"status\":\"PICKED_UP\",\"clientRequestId\":" + bad + "}");
			if (response.getStatus() != 400) {
				notRefused.add(bad + " -> " + response.getStatus());
			}
		}
		assertEquals(List.of(), notRefused, "keys that were not refused with a 400");
		assertNull(statusOf(t.bus(), t.run(), t.first()), "a refused request records nothing");

		MockHttpServletResponse malformed = rawTap(driver, t.run(), t.first(),
				"{\"status\":\"PICKED_UP\",\"clientRequestId\":\"abc\"}");
		assertEquals("Malformed request body", JsonPath.read(malformed.getContentAsString(), "$.detail"));
		assertEquals(200, tap(driver, t.run(), t.first(), "PICKED_UP", "6F1C2A4E-8B3D-4E5F-9A7B-1C2D3E4F5A6B").getStatus(),
				"a UUID in capitals is a UUID");
	}

	@Test
	void everyoneButADriverIsRefusedAndASignedOutCallerIs401() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		String url = "/api/driver/runs/" + t.run() + "/students/" + t.first() + "/confirmation";
		String body = "{\"status\":\"PICKED_UP\",\"clientRequestId\":\"" + key() + "\"}";
		for (Role role : List.of(Role.PARENT, Role.HEAD_OF_TRANSPORT, Role.ADMIN)) {
			assertEquals(403, send(put(url).with(as(role, UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
					.content(body)).getStatus(), role.name());
		}
		assertEquals(401, send(put(url).contentType(MediaType.APPLICATION_JSON).content(body)).getStatus());
		assertNull(statusOf(t.bus(), t.run(), t.first()));
	}

	@Test
	void theContractsSamplesAreAcceptedAndHaveTheFieldsOfTheRealAnswers() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		UUID driver = t.bus().driverUserId();
		String request = Files.readString(Path.of("../docs/contracts/samples/runs/confirmation-request.json"));
		assertEquals(Set.of("status", "clientRequestId"), new TreeSet<>(((Map<String, Object>) JsonPath.read(request, "$")).keySet()));
		assertEquals(200, rawTap(driver, t.run(), t.first(), request).getStatus(), "the sample is a valid body");

		MockHttpServletResponse reused = tap(driver, t.run(), t.first(), "NOT_PRESENT",
				JsonPath.read(request, "$.clientRequestId"));
		assertEquals(422, reused.getStatus());
		String sample = Files.readString(Path.of("../docs/contracts/samples/runs/confirmation-key-reused.json"));
		assertEquals(new TreeSet<>(((Map<String, Object>) JsonPath.read(sample, "$")).keySet()),
				new TreeSet<>(((Map<String, Object>) JsonPath.read(reused.getContentAsString(), "$")).keySet()),
				"confirmation-key-reused.json");
		assertEquals(422, whole(JsonPath.read(sample, "$.status")));
		assertNotNull(JsonPath.read(sample, "$.detail"));
	}
}
