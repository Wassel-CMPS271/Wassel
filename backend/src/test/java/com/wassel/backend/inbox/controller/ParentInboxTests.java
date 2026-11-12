package com.wassel.backend.inbox.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.inbox.repository.InboxEventRepository;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SCRUM-267, against {@code docs/contracts/inbox.md}. The entries come from real driver confirmations on a started
 * run, through the endpoints, on the run tests' fixtures (a fresh school each test, "now" a Wednesday morning).
 */
class ParentInboxTests extends RunCriteriaSupport {

	@Autowired
	private InboxEventRepository inboxEventRepository;

	@Autowired
	private TransactionTemplate transactionTemplate;

	// --- fixtures -----------------------------------------------------------------------------

	/** A started morning run with Rami (whose parent is given) on it. */
	private record Morning(Bus bus, UUID parent, UUID child, String runId) {
	}

	private Morning aStartedRunWithRami() throws Exception {
		UUID parent = aParent();
		return aStartedRunWith(parent);
	}

	private Morning aStartedRunWith(UUID parent) throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID child = aStudent("Rami", parent);
		onRoute(bus, child);
		String runId = runId(bus, "MORNING");
		assertEquals(200, start(bus, runId).getStatus());
		return new Morning(bus, parent, child, runId);
	}

	private void confirmOk(Morning m, String status) throws Exception {
		MockHttpServletResponse response = confirm(m.bus(), m.runId(), m.child(), status);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		// The test clock stands still, and "newest first" needs each entry to have its own time.
		clock.set(clock.instant().plusSeconds(1));
	}

	private String inbox(UUID parent, String query) throws Exception {
		MockHttpServletResponse response = send(get("/api/parent/inbox" + query).with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private int unread(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get("/api/parent/inbox/unread-count").with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus());
		return JsonPath.read(response.getContentAsString(), "$.count");
	}

	private MockHttpServletResponse markRead(UUID parent, String id) throws Exception {
		return send(post("/api/parent/inbox/" + id + "/read").with(as(Role.PARENT, parent)));
	}

	// --- making entries -----------------------------------------------------------------------

	@Test
	void aPickUpMakesAnUnreadEntryForTheLinkedParent() throws Exception {
		Morning m = aStartedRunWithRami();

		confirmOk(m, "PICKED_UP");

		String body = inbox(m.parent(), "");
		assertEquals(1, ((List<?>) JsonPath.read(body, "$")).size());
		assertNotNull(JsonPath.read(body, "$[0].id"));
		assertEquals("PICKED_UP", JsonPath.read(body, "$[0].type"));
		assertEquals(m.child().toString(), JsonPath.read(body, "$[0].studentId"));
		assertEquals("Rami Nasr", JsonPath.read(body, "$[0].studentName"));
		assertEquals(m.runId(), JsonPath.read(body, "$[0].runId"));
		assertEquals("MORNING", JsonPath.read(body, "$[0].direction"));
		assertNotNull(JsonPath.read(body, "$[0].createdAt"));
		assertNull(JsonPath.read(body, "$[0].readAt"));
		assertEquals(1, unread(m.parent()));
	}

	@Test
	void everyKindOfConfirmationMakesItsOwnEntry() throws Exception {
		Morning m = aStartedRunWithRami();

		confirmOk(m, "PICKED_UP");
		confirmOk(m, "DROPPED_OFF");

		String body = inbox(m.parent(), "");
		assertEquals(List.of("DROPPED_OFF", "PICKED_UP"), JsonPath.read(body, "$[*].type"), "newest first");
	}

	@Test
	void aChildWhoWasNotAtTheStopMakesAnEntryAndABackdatedPickUpMakesAnother() throws Exception {
		Morning m = aStartedRunWithRami();

		confirmOk(m, "NOT_PRESENT");
		confirmOk(m, "PICKED_UP");

		String body = inbox(m.parent(), "");
		assertEquals(List.of("PICKED_UP", "NOT_PRESENT"), JsonPath.read(body, "$[*].type"));
	}

	@Test
	void aRetriedConfirmationMakesNoSecondEntry() throws Exception {
		Morning m = aStartedRunWithRami();

		confirmOk(m, "PICKED_UP");
		confirmOk(m, "PICKED_UP");
		confirmOk(m, "PICKED_UP");

		assertEquals(1, ((List<?>) JsonPath.read(inbox(m.parent(), ""), "$")).size());
		assertEquals(1, unread(m.parent()));
	}

	@Test
	void aRefusedConfirmationMakesNoEntry() throws Exception {
		Morning m = aStartedRunWithRami();

		MockHttpServletResponse response = confirm(m.bus(), m.runId(), m.child(), "DROPPED_OFF");

		assertEquals(409, response.getStatus());
		assertEquals(0, ((List<?>) JsonPath.read(inbox(m.parent(), ""), "$")).size());
	}

	@Test
	void aChildWithNoLinkedParentMakesNoEntryAndTheConfirmationStillWorks() throws Exception {
		Morning m = aStartedRunWith(null);

		confirmOk(m, "PICKED_UP");

		assertTrue(inboxEventRepository.findAll().stream().noneMatch(event -> event.getSchoolId().equals(school)));
	}

	@Test
	void theEntryStaysWithTheParentLinkedWhenItHappened() throws Exception {
		Morning m = aStartedRunWithRami();
		confirmOk(m, "PICKED_UP");
		UUID next = aParent();
		Student student = studentRepository.findById(m.child()).orElseThrow();
		student.setParentUserId(next);
		studentRepository.save(student);

		assertEquals(1, ((List<?>) JsonPath.read(inbox(m.parent(), ""), "$")).size());
		assertEquals(0, ((List<?>) JsonPath.read(inbox(next, ""), "$")).size());

		confirmOk(m, "DROPPED_OFF");

		assertEquals(1, ((List<?>) JsonPath.read(inbox(next, ""), "$")).size());
		assertEquals("DROPPED_OFF", JsonPath.read(inbox(next, ""), "$[0].type"));
	}

	// --- reading ------------------------------------------------------------------------------

	@Test
	void anEmptyInboxIsAnEmptyListAndAZeroCount() throws Exception {
		UUID parent = aParent();

		assertEquals(0, ((List<?>) JsonPath.read(inbox(parent, ""), "$")).size());
		assertEquals(0, ((List<?>) JsonPath.read(inbox(parent, "?unread=true"), "$")).size());
		assertEquals(0, unread(parent));
	}

	@Test
	void anotherParentAndAnotherSchoolSeeNothing() throws Exception {
		Morning m = aStartedRunWithRami();
		confirmOk(m, "PICKED_UP");
		String id = JsonPath.read(inbox(m.parent(), ""), "$[0].id");

		UUID stranger = aParent();
		assertEquals(0, ((List<?>) JsonPath.read(inbox(stranger, ""), "$")).size());
		assertEquals(0, unread(stranger));
		assertEquals(404, markRead(stranger, id).getStatus());

		MockHttpServletResponse otherSchool = send(get("/api/parent/inbox")
				.with(as(Role.PARENT, m.parent(), UUID.randomUUID())));
		assertEquals(0, ((List<?>) JsonPath.read(otherSchool.getContentAsString(), "$")).size());
		assertEquals(404, send(post("/api/parent/inbox/" + id + "/read")
				.with(as(Role.PARENT, m.parent(), UUID.randomUUID()))).getStatus());
		assertNull(JsonPath.read(inbox(m.parent(), ""), "$[0].readAt"), "a refused read changes nothing");
	}

	@Test
	void markingOneReadAnswersWithItKeepsTheFirstTimeAndLeavesTheOthers() throws Exception {
		Morning m = aStartedRunWithRami();
		confirmOk(m, "PICKED_UP");
		confirmOk(m, "DROPPED_OFF");
		String newest = JsonPath.read(inbox(m.parent(), ""), "$[0].id");

		MockHttpServletResponse first = markRead(m.parent(), newest);

		assertEquals(200, first.getStatus());
		assertEquals(newest, JsonPath.read(first.getContentAsString(), "$.id"));
		String firstReadAt = JsonPath.read(first.getContentAsString(), "$.readAt");
		assertNotNull(firstReadAt);
		assertEquals(1, unread(m.parent()));
		clock.set(clock.instant().plusSeconds(600));

		MockHttpServletResponse again = markRead(m.parent(), newest);

		assertEquals(200, again.getStatus());
		assertEquals(firstReadAt, JsonPath.read(again.getContentAsString(), "$.readAt"));
		assertEquals(List.of(), JsonPath.read(inbox(m.parent(), "?unread=true"), "$[?(@.id == '" + newest + "')]"));
		assertEquals(1, ((List<?>) JsonPath.read(inbox(m.parent(), "?unread=true"), "$")).size());
	}

	@Test
	void onlyTrueFiltersToUnreadAndAnyOtherValueListsAll() throws Exception {
		Morning m = aStartedRunWithRami();
		confirmOk(m, "PICKED_UP");
		confirmOk(m, "DROPPED_OFF");
		markRead(m.parent(), JsonPath.read(inbox(m.parent(), ""), "$[0].id"));

		assertEquals(1, ((List<?>) JsonPath.read(inbox(m.parent(), "?unread=true"), "$")).size());
		for (String other : List.of("?unread=false", "?unread=foo", "?unread=yes", "?unread=1", "?unread=")) {
			assertEquals(2, ((List<?>) JsonPath.read(inbox(m.parent(), other), "$")).size(), other + " lists all");
		}
	}

	@Test
	void unknownAndMalformedIdsAreRefused() throws Exception {
		UUID parent = aParent();

		assertEquals(404, markRead(parent, UUID.randomUUID().toString()).getStatus());
		assertEquals(400, markRead(parent, "not-a-uuid").getStatus());
	}

	@Test
	void readAllMarksEveryUnreadEntryAndIsFineWhenThereAreNone() throws Exception {
		Morning m = aStartedRunWithRami();
		confirmOk(m, "PICKED_UP");
		confirmOk(m, "DROPPED_OFF");
		UUID other = aParent();

		assertEquals(204, send(post("/api/parent/inbox/read-all").with(as(Role.PARENT, other))).getStatus());
		assertEquals(2, unread(m.parent()), "another parent's read-all touches nothing of this one");
		assertEquals(204, send(post("/api/parent/inbox/read-all").with(as(Role.PARENT, m.parent()))).getStatus());

		assertEquals(0, unread(m.parent()));
		assertEquals(0, ((List<?>) JsonPath.read(inbox(m.parent(), "?unread=true"), "$")).size());
		assertEquals(2, ((List<?>) JsonPath.read(inbox(m.parent(), ""), "$")).size());
		assertEquals(204, send(post("/api/parent/inbox/read-all").with(as(Role.PARENT, m.parent()))).getStatus());
	}

	@Test
	void theListIsTheNewestFiftyButTheCountIsEveryUnreadEntry() throws Exception {
		Morning m = aStartedRunWithRami();
		Instant start = clock.instant();
		for (int i = 0; i < 51; i++) {
			Instant at = start.plusSeconds(i);
			assertEquals(Integer.valueOf(1), transactionTemplate.execute(tx -> inboxEventRepository.insertIfMissing(school,
					m.parent(), m.child(), "Rami Nasr", UUID.randomUUID(), "MORNING", "PICKED_UP", at)));
		}

		String body = inbox(m.parent(), "");

		assertEquals(50, ((List<?>) JsonPath.read(body, "$")).size());
		assertEquals(start.plusSeconds(50), Instant.parse(JsonPath.read(body, "$[0].createdAt")), "newest first");
		assertEquals(51, unread(m.parent()));
		assertEquals(50, ((List<?>) JsonPath.read(inbox(m.parent(), "?unread=true"), "$")).size());
	}
}
