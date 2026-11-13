package com.wassel.backend.inbox.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.common.config.ClockConfig;
import com.wassel.backend.schools.entity.SchoolSettings;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SCRUM-266: independent tests of the parent inbox API (SCRUM-267), written from {@code docs/contracts/inbox.md}, its
 * samples and the ticket, never from {@code ParentInboxTests} or the inbox code. Entries are made only the way a
 * parent's inbox gets them in real life: the driver's confirmation through HTTP. Every test has its own school.
 *
 * <p>The stories behind it are SCRUM-34, 35 and 36 (picked up, dropped off, not at the stop). Where the Jira ticket and
 * the contract differ (the ticket lists absences, the contract says a parent-reported absence is not an entry), these
 * tests follow the contract and the report says so.
 */
class ParentInboxCriteriaTests extends RunCriteriaSupport {

	private static final String INBOX = "/api/parent/inbox";

	private static final Set<String> KEYS = Set.of("id", "type", "studentId", "studentName", "runId", "direction",
			"createdAt", "readAt");

	/** One parent with one child on a morning run the driver has started. */
	private record Family(UUID parent, Bus bus, UUID child, String run) {
	}

	private Family aStartedMorningRun(String childName) throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID child = aStudent(childName, parent);
		onRoute(bus, child);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		return new Family(parent, bus, child, run);
	}

	private void confirmed(Bus bus, String run, UUID child, String status) throws Exception {
		MockHttpServletResponse response = confirm(bus, run, child, status);
		assertEquals(200, response.getStatus(), response.getContentAsString());
	}

	private String inbox(UUID parent, String unreadParam) throws Exception {
		MockHttpServletResponse response = send(unreadParam == null ? get(INBOX).with(as(Role.PARENT, parent))
				: get(INBOX).param("unread", unreadParam).with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private int unreadCount(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get(INBOX + "/unread-count").with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return JsonPath.read(response.getContentAsString(), "$.count");
	}

	private MockHttpServletResponse read(UUID parent, String entryId) throws Exception {
		return send(post(INBOX + "/" + entryId + "/read").with(as(Role.PARENT, parent)));
	}

	private static List<String> types(String body) {
		return JsonPath.read(body, "$[*].type");
	}

	private static List<String> ids(String body) {
		return JsonPath.read(body, "$[*].id");
	}

	/** Runs the calls at the same instant, each behind a barrier (the same idea as CriteriaTestSupport.inParallel). */
	private static <T> List<T> inParallel(List<Callable<T>> calls) throws Exception {
		// TODO: use common.Parallel once #156 moves inParallel there
		ExecutorService pool = Executors.newFixedThreadPool(calls.size());
		try {
			CyclicBarrier gate = new CyclicBarrier(calls.size());
			List<Future<T>> pending = new ArrayList<>();
			for (Callable<T> call : calls) {
				pending.add(pool.submit(() -> {
					gate.await();
					return call.call();
				}));
			}
			List<T> answers = new ArrayList<>();
			for (Future<T> answer : pending) {
				answers.add(answer.get(60, TimeUnit.SECONDS));
			}
			return answers;
		}
		finally {
			pool.shutdownNow();
			if (!pool.awaitTermination(10, TimeUnit.SECONDS)) {
				throw new AssertionError("a worker is still running after its test: " + pool);
			}
		}
	}

	// ---------------------------------------------------------------- what an entry holds

	/** Contract "InboxEvent" and samples/inbox/inbox-event-unread.json: exactly these eight keys, nothing else. */
	@Test
	void anEntryHasExactlyTheContractsEightKeysAndTheValuesOfTheConfirmation() throws Exception {
		Family f = aStartedMorningRun("Tarek");

		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");

		String body = inbox(f.parent(), null);
		assertEquals(1, ((List<?>) JsonPath.read(body, "$")).size());
		Map<String, Object> entry = JsonPath.read(body, "$[0]");
		assertEquals(KEYS, entry.keySet());
		assertEquals("PICKED_UP", entry.get("type"));
		assertEquals(f.child().toString(), entry.get("studentId"));
		assertEquals("Tarek Nasr", entry.get("studentName"));
		assertEquals(f.run(), entry.get("runId"));
		assertEquals("MORNING", entry.get("direction"));
		assertNull(entry.get("readAt"));
		String createdAt = (String) entry.get("createdAt");
		assertTrue(createdAt.endsWith("Z"), createdAt);
		assertEquals(clock.instant(), Instant.parse(createdAt), "createdAt is the confirmation's time from the server");
		assertNotNull(UUID.fromString((String) entry.get("id")));
	}

	/** Contract: one entry for each of the three confirmations. */
	@Test
	void eachOfTheThreeConfirmationsMakesOneEntryOfItsOwnType() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID tarek = aStudent("Tarek", parent);
		UUID rana = aStudent("Rana", parent);
		onRoute(bus, tarek, rana);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());

		confirmed(bus, run, tarek, "PICKED_UP");
		assertEquals(List.of("PICKED_UP"), types(inbox(parent, null)));

		confirmed(bus, run, tarek, "DROPPED_OFF");
		assertEquals(Set.of("PICKED_UP", "DROPPED_OFF"), Set.copyOf(types(inbox(parent, null))));

		confirmed(bus, run, rana, "NOT_PRESENT");
		List<String> all = types(inbox(parent, null));
		assertEquals(3, all.size());
		assertEquals(Set.of("PICKED_UP", "DROPPED_OFF", "NOT_PRESENT"), Set.copyOf(all));
	}

	/** Contract "An absence the parent reports is not an entry"; the Jira ticket says otherwise (report, conflict C1). */
	@Test
	void anAbsenceTheParentReportsMakesNoEntry() throws Exception {
		Family f = aStartedMorningRun("Tarek");

		absentToday(f.parent(), f.child());

		assertEquals("[]", inbox(f.parent(), null));
		assertEquals(0, unreadCount(f.parent()));
	}

	// ---------------------------------------------------------------- "the same event": run, child and type

	/** Contract: a driver's retry or a replay of a confirmation the child already has makes no second entry. */
	@Test
	void sendingTheSameStatusAgainMakesNoSecondEntry() throws Exception {
		Family f = aStartedMorningRun("Tarek");

		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");

		assertEquals(List.of("PICKED_UP"), types(inbox(f.parent(), null)));
		assertEquals(1, unreadCount(f.parent()));
	}

	/** Contract (runs.md): a retry of "picked up" after "dropped off" is 200 and not a new event. */
	@Test
	void aPickedUpRetryAfterDroppedOffMakesNoThirdEntry() throws Exception {
		Family f = aStartedMorningRun("Tarek");
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
		confirmed(f.bus(), f.run(), f.child(), "DROPPED_OFF");

		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");

		List<String> types = types(inbox(f.parent(), null));
		assertEquals(2, types.size());
		assertEquals(Set.of("PICKED_UP", "DROPPED_OFF"), Set.copyOf(types));
	}

	/** Contract: NOT_PRESENT, then PICKED_UP, makes an entry for each, because both were true when saved. */
	@Test
	void aWrongTapMovedOnMakesAnEntryForEachStatus() throws Exception {
		Family f = aStartedMorningRun("Tarek");

		confirmed(f.bus(), f.run(), f.child(), "NOT_PRESENT");
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");

		List<String> types = types(inbox(f.parent(), null));
		assertEquals(2, types.size());
		assertEquals(Set.of("NOT_PRESENT", "PICKED_UP"), Set.copyOf(types));
		assertEquals(2, unreadCount(f.parent()));
	}

	/** Contract: an entry is once per run, child and type, so the other run of the day is a different event. */
	@Test
	void theSameChildOnTheMorningAndTheAfternoonRunHasSeparateEntries() throws Exception {
		Family f = aStartedMorningRun("Tarek");
		String afternoon = runId(f.bus(), "AFTERNOON");
		assertEquals(200, start(f.bus(), afternoon).getStatus());

		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
		confirmed(f.bus(), afternoon, f.child(), "PICKED_UP");

		String body = inbox(f.parent(), null);
		assertEquals(2, types(body).size());
		assertEquals(Set.of("MORNING", "AFTERNOON"), Set.copyOf(JsonPath.<List<String>>read(body, "$[*].direction")));
		assertEquals(Set.of(f.run(), afternoon), Set.copyOf(JsonPath.<List<String>>read(body, "$[*].runId")));
	}

	/** Two children of one parent on one run: both are the parent's, so both entries are theirs. */
	@Test
	void twoSiblingsOnOneRunGiveTwoEntriesBothVisibleToTheParent() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID tarek = aStudent("Tarek", parent);
		UUID rana = aStudent("Rana", parent);
		onRoute(bus, tarek, rana);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());

		confirmed(bus, run, tarek, "PICKED_UP");
		confirmed(bus, run, rana, "PICKED_UP");

		String body = inbox(parent, null);
		assertEquals(Set.of("Tarek Nasr", "Rana Nasr"), Set.copyOf(JsonPath.<List<String>>read(body, "$[*].studentName")));
		assertEquals(2, unreadCount(parent));
	}

	/** Two taps at the same instant: one entry, and neither answer is a server error (both are 200). */
	@Test
	void twoTapsAtTheSameInstantMakeOneEntryAndNoServerError() throws Exception {
		Family f = aStartedMorningRun("Tarek");

		List<Integer> answers = inParallel(List.of(
				() -> confirm(f.bus(), f.run(), f.child(), "PICKED_UP").getStatus(),
				() -> confirm(f.bus(), f.run(), f.child(), "PICKED_UP").getStatus()));

		assertEquals(List.of(200, 200), answers);
		assertEquals(List.of("PICKED_UP"), types(inbox(f.parent(), null)));
	}

	// ---------------------------------------------------------------- who gets the entry

	/** Contract: a child with no linked parent makes none (and nobody else receives it). */
	@Test
	void aChildWithNoLinkedParentMakesNoEntryForAnyone() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID unlinked = aStudent("Tarek", null);
		UUID theirs = aStudent("Rana", parent);
		onRoute(bus, unlinked, theirs);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());

		confirmed(bus, run, unlinked, "PICKED_UP");

		assertEquals("[]", inbox(parent, null));
		assertEquals(0, unreadCount(parent));
	}

	/** Contract: the entry goes to the parent linked when the confirmation is saved; earlier entries stay put. */
	@Test
	void relinkingTheChildSendsLaterEntriesToTheNewParentAndLeavesEarlierOnesWithTheOldOne() throws Exception {
		Family f = aStartedMorningRun("Tarek");
		UUID newParent = aParent();
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");

		MockHttpServletResponse linked = send(patch("/api/head-of-transport/students/" + f.child() + "/parent")
				.with(head()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"parentUserId\":\"%s\"}".formatted(newParent)));
		assertEquals(200, linked.getStatus(), linked.getContentAsString());
		confirmed(f.bus(), f.run(), f.child(), "DROPPED_OFF");

		assertEquals(List.of("PICKED_UP"), types(inbox(f.parent(), null)));
		assertEquals(List.of("DROPPED_OFF"), types(inbox(newParent, null)));
	}

	/** Contract: only the parent's own entries; another family's child on the same run never shows, in list or count. */
	@Test
	void aParentNeverSeesAnotherFamilysChildInTheListOrTheCount() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID parentA = aParent();
		UUID parentB = aParent();
		UUID tarek = aStudent("Tarek", parentA);
		UUID bilal = aStudent("Bilal", parentB);
		onRoute(bus, tarek, bilal);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());

		confirmed(bus, run, tarek, "PICKED_UP");
		confirmed(bus, run, bilal, "NOT_PRESENT");

		String a = inbox(parentA, null);
		assertEquals(List.of("Tarek Nasr"), JsonPath.<List<String>>read(a, "$[*].studentName"));
		assertEquals(1, unreadCount(parentA));
		assertFalse(a.contains("Bilal"), "no other child's name in the answer");
		assertFalse(a.contains(bilal.toString()), "no other child's id in the answer");
		String b = inbox(parentB, null);
		assertEquals(List.of("Bilal Nasr"), JsonPath.<List<String>>read(b, "$[*].studentName"));
		assertFalse(b.contains("Tarek"));
		assertEquals(1, unreadCount(parentB));
	}

	/** Contract: one school; a parent of another school sees nothing of this one. */
	@Test
	void aParentOfAnotherSchoolSeesNothing() throws Exception {
		Family f = aStartedMorningRun("Tarek");
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
		UUID other = UUID.randomUUID();

		MockHttpServletResponse list = send(get(INBOX).with(as(Role.PARENT, UUID.randomUUID(), other)));
		MockHttpServletResponse count = send(get(INBOX + "/unread-count").with(as(Role.PARENT, UUID.randomUUID(), other)));

		assertEquals("[]", list.getContentAsString());
		assertEquals(0, (int) JsonPath.read(count.getContentAsString(), "$.count"));
	}

	// ---------------------------------------------------------------- listing

	/** Contract: newest first. The clock moves a second between the three so the order is not a tie. */
	@Test
	void theListIsNewestFirstAndUnreadTrueKeepsOnlyUnreadOnes() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID a = aStudent("Adam", parent);
		UUID b = aStudent("Bilal", parent);
		UUID c = aStudent("Celine", parent);
		onRoute(bus, a, b, c);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		confirmed(bus, run, a, "PICKED_UP");
		clock.set(clock.instant().plusSeconds(1));
		confirmed(bus, run, b, "PICKED_UP");
		clock.set(clock.instant().plusSeconds(1));
		confirmed(bus, run, c, "PICKED_UP");

		String all = inbox(parent, null);

		assertEquals(List.of("Celine Nasr", "Bilal Nasr", "Adam Nasr"), JsonPath.<List<String>>read(all, "$[*].studentName"));
		assertEquals(200, read(parent, ids(all).get(1)).getStatus());
		assertEquals(List.of("Celine Nasr", "Adam Nasr"),
				JsonPath.<List<String>>read(inbox(parent, "true"), "$[*].studentName"));
		assertEquals(3, ids(inbox(parent, null)).size(), "the read one is still in the full list");
	}

	/** Contract: "any other value, or none, lists all". */
	@Test
	void anyUnreadValueButTrueListsEverything() throws Exception {
		Family f = aStartedMorningRun("Tarek");
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
		assertEquals(200, read(f.parent(), ids(inbox(f.parent(), null)).get(0)).getStatus());

		for (String other : List.of("false", "yes", "TRUE", "1", "")) {
			assertEquals(1, ids(inbox(f.parent(), other)).size(), "unread=" + other + " lists everything");
		}
		assertEquals(0, ids(inbox(f.parent(), "true")).size());
	}

	/**
	 * Contract: "at most 50", "the unread count counts all unread entries, not only the 50 listed". 51 children
	 * of one parent on four buses (14 seats each), one confirmation each a second apart; the oldest drops off.
	 */
	@Test
	void fiftyOneEntriesListTheNewestFiftyAndTheCountSaysFiftyOne() throws Exception {
		UUID parent = aParent();
		List<UUID> children = new ArrayList<>();
		List<Bus> buses = new ArrayList<>();
		List<String> runs = new ArrayList<>();
		for (int i = 0; i < 51; i++) {
			if (i % 14 == 0) {
				Bus bus = aBus("Bus " + (i / 14));
				buses.add(bus);
			}
			UUID child = aStudent("Child" + i, parent);
			children.add(child);
			onRoute(buses.get(i / 14), child);
		}
		for (Bus bus : buses) {
			String run = runId(bus, "MORNING");
			assertEquals(200, start(bus, run).getStatus());
			runs.add(run);
		}
		Instant first = clock.instant();
		for (int i = 0; i < 51; i++) {
			clock.set(first.plusSeconds(i));
			confirmed(buses.get(i / 14), runs.get(i / 14), children.get(i), "PICKED_UP");
		}

		String body = inbox(parent, null);

		List<String> names = JsonPath.read(body, "$[*].studentName");
		assertEquals(50, names.size());
		assertEquals("Child50 Nasr", names.get(0), "newest first");
		assertEquals("Child1 Nasr", names.get(49));
		assertFalse(names.contains("Child0 Nasr"), "the oldest one is the one left out");
		assertEquals(50, ids(inbox(parent, "true")).size());
		assertEquals(51, unreadCount(parent));
	}

	// ---------------------------------------------------------------- the unread count

	/** Contract: nothing gives [] and a count of 0; the count follows reads. */
	@Test
	void theCountIsZeroForAParentWithNothingAndDropsAfterARead() throws Exception {
		UUID nothing = aParent();
		assertEquals("[]", inbox(nothing, null));
		assertEquals(0, unreadCount(nothing));
		Family f = aStartedMorningRun("Tarek");
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
		confirmed(f.bus(), f.run(), f.child(), "DROPPED_OFF");
		assertEquals(2, unreadCount(f.parent()));

		assertEquals(200, read(f.parent(), ids(inbox(f.parent(), null)).get(0)).getStatus());

		assertEquals(1, unreadCount(f.parent()));
	}

	// ---------------------------------------------------------------- read one

	/** Contract: read answers with the entry, readAt set; again keeps the first readAt, even when the clock moved. */
	@Test
	void readingSetsReadAtOnceAndAnotherReadKeepsTheFirstOne() throws Exception {
		Family f = aStartedMorningRun("Tarek");
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
		String entry = ids(inbox(f.parent(), null)).get(0);
		Instant firstRead = clock.instant();

		MockHttpServletResponse first = read(f.parent(), entry);
		clock.set(firstRead.plusSeconds(120));
		MockHttpServletResponse second = read(f.parent(), entry);

		assertEquals(200, first.getStatus(), first.getContentAsString());
		assertEquals(200, second.getStatus(), second.getContentAsString());
		Map<String, Object> shown = JsonPath.read(first.getContentAsString(), "$");
		assertEquals(KEYS, shown.keySet());
		assertEquals(entry, shown.get("id"));
		assertEquals(firstRead, Instant.parse((String) shown.get("readAt")));
		assertEquals(firstRead, Instant.parse(JsonPath.read(second.getContentAsString(), "$.readAt")));
		assertEquals(0, unreadCount(f.parent()));
	}

	/** Contract: another parent's entry and an unknown id are the same 404, and the entry is not touched. */
	@Test
	void anotherParentsEntryAndAnUnknownIdAreBoth404AndChangeNothing() throws Exception {
		Family f = aStartedMorningRun("Tarek");
		UUID stranger = aParent();
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
		String entry = ids(inbox(f.parent(), null)).get(0);

		MockHttpServletResponse notYours = read(stranger, entry);
		MockHttpServletResponse unknown = read(f.parent(), UUID.randomUUID().toString());

		assertEquals(404, notYours.getStatus());
		assertEquals(404, unknown.getStatus());
		String unknownDetail = JsonPath.read(unknown.getContentAsString(), "$.detail");
		String notYoursDetail = JsonPath.read(notYours.getContentAsString(), "$.detail");
		assertEquals(unknownDetail, notYoursDetail, "the same answer for both");
		assertNull(JsonPath.<String>read(inbox(f.parent(), null), "$[0].readAt"), "the owner's entry is still unread");
		assertEquals(1, unreadCount(f.parent()));
	}

	/** Contract (inbox.md, "Errors"): another school's entry is the same 404 as another parent's (the session decides the school). */
	@Test
	void anEntryOfAnotherSchoolIsA404() throws Exception {
		UUID mine = school;
		school = UUID.randomUUID();
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(school)
				.arrivalTime(LocalTime.of(7, 30)).dismissalTime(LocalTime.of(14, 0)).build());
		Family theirs = aStartedMorningRun("Tarek");
		confirmed(theirs.bus(), theirs.run(), theirs.child(), "PICKED_UP");
		String theirEntry = JsonPath.read(inbox(theirs.parent(), null), "$[0].id");
		UUID theirSchool = school;
		school = mine;
		UUID me = aParent();

		MockHttpServletResponse response = read(me, theirEntry);

		assertEquals(404, response.getStatus());
		assertEquals(0, unreadCount(me));
		String theirList = send(get(INBOX).with(as(Role.PARENT, theirs.parent(), theirSchool))).getContentAsString();
		assertNull(JsonPath.<String>read(theirList, "$[0].readAt"), "the other school's entry is still unread");
	}

	/** Contract: an id in the path that does not parse is 400 with "Invalid request parameter". */
	@Test
	void anIdThatIsNotAUuidIs400InvalidRequestParameter() throws Exception {
		UUID parent = aParent();

		MockHttpServletResponse response = read(parent, "not-a-uuid");

		assertEquals(400, response.getStatus());
		assertEquals("Invalid request parameter", JsonPath.read(response.getContentAsString(), "$.detail"));
	}

	/**
	 * Two reads of one entry at once: both 200, one readAt. The clock is frozen in most tests, which would hide a second read
	 * overwriting the first, so each call moves the clock to a time of its own just before it reads (three rounds): whichever
	 * read lands first sets the time, and the other answer and the list must show that same time.
	 */
	@Test
	void simultaneousReadsOnClocksOfTheirOwnAreAllOkWithOneReadAt() throws Exception {
		Instant base = clock.instant();
		for (int round = 0; round < 3; round++) {
			Family f = aStartedMorningRun("Tarek" + round);
			confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");
			String entry = ids(inbox(f.parent(), null)).get(0);
			clock.set(base);

			List<MockHttpServletResponse> answers = inParallel(List.of(() -> {
				clock.set(base.plusSeconds(60));
				return read(f.parent(), entry);
			}, () -> {
				clock.set(base.plusSeconds(120));
				return read(f.parent(), entry);
			}, () -> read(f.parent(), entry)));

			for (MockHttpServletResponse answer : answers) {
				assertEquals(200, answer.getStatus(), "round " + round + ": " + answer.getContentAsString());
			}
			String readAt = JsonPath.read(answers.get(0).getContentAsString(), "$.readAt");
			assertNotNull(readAt);
			for (MockHttpServletResponse answer : answers) {
				assertEquals(readAt, JsonPath.read(answer.getContentAsString(), "$.readAt"), "round " + round + ": one readAt");
			}
			assertEquals(readAt, JsonPath.read(inbox(f.parent(), null), "$[0].readAt"), "round " + round);
		}
	}

	// ---------------------------------------------------------------- read all

	/** Contract: read-all is 204 even with nothing to mark, and never touches another parent's entries. */
	@Test
	void readAllMarksOnlyTheCallersEntriesAndIs204EvenWhenThereIsNothingToMark() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID parentA = aParent();
		UUID parentB = aParent();
		UUID tarek = aStudent("Tarek", parentA);
		UUID bilal = aStudent("Bilal", parentB);
		onRoute(bus, tarek, bilal);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		confirmed(bus, run, tarek, "PICKED_UP");
		confirmed(bus, run, tarek, "DROPPED_OFF");
		confirmed(bus, run, bilal, "PICKED_UP");

		MockHttpServletResponse first = send(post(INBOX + "/read-all").with(as(Role.PARENT, parentA)));
		MockHttpServletResponse again = send(post(INBOX + "/read-all").with(as(Role.PARENT, parentA)));

		assertEquals(204, first.getStatus());
		assertEquals(204, again.getStatus());
		assertEquals(0, unreadCount(parentA));
		assertEquals(2, ids(inbox(parentA, null)).size(), "read entries stay in the list");
		assertEquals(1, unreadCount(parentB), "another parent's entry stays unread");
		assertEquals(204, send(post(INBOX + "/read-all").with(as(Role.PARENT, aParent()))).getStatus());
	}

	// ---------------------------------------------------------------- roles

	/** The four endpoints: 401 with an empty body when signed out, 403 for head, admin and driver. */
	@Test
	void everyEndpointIs401WhenSignedOutAnd403ForEveryOtherRole() throws Exception {
		String entry = UUID.randomUUID().toString();
		List<MockHttpServletRequestBuilder> calls = List.of(
				get(INBOX), get(INBOX + "/unread-count"), post(INBOX + "/" + entry + "/read"), post(INBOX + "/read-all"));
		for (var call : calls) {
			MockHttpServletResponse signedOut = send(call);
			assertEquals(401, signedOut.getStatus(), call.toString());
			assertEquals("", signedOut.getContentAsString(), "401 has an empty body");
		}
		for (Role role : List.of(Role.HEAD_OF_TRANSPORT, Role.ADMIN, Role.DRIVER)) {
			var requests = List.of(get(INBOX).with(as(role, UUID.randomUUID())),
					get(INBOX + "/unread-count").with(as(role, UUID.randomUUID())),
					post(INBOX + "/" + entry + "/read").with(as(role, UUID.randomUUID())),
					post(INBOX + "/read-all").with(as(role, UUID.randomUUID())));
			for (var request : requests) {
				MockHttpServletResponse response = send(request);
				assertEquals(403, response.getStatus(), role + " " + request);
				String detail = JsonPath.read(response.getContentAsString(), "$.detail");
				assertFalse(detail.isBlank(), "403 carries a detail: " + role + " " + request);
			}
		}
	}

	/** Contract: createdAt is a moment, shown in UTC (a trailing Z) whatever the school's zone. */
	@Test
	void createdAtIsAMomentInUtcNotSchoolLocalTime() throws Exception {
		Family f = aStartedMorningRun("Tarek");
		confirmed(f.bus(), f.run(), f.child(), "PICKED_UP");

		String createdAt = JsonPath.read(inbox(f.parent(), null), "$[0].createdAt");

		assertEquals(WEDNESDAY_7AM.atZone(ClockConfig.SCHOOL_ZONE).toInstant(), Instant.parse(createdAt));
		assertTrue(createdAt.startsWith("2026-11-04T05:00"), "07:00 in Beirut is 05:00Z in November: " + createdAt);
	}
}
