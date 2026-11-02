package com.wassel.backend.parent.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.runs.repository.RunRepository;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * SCRUM-242: independent tests of SCRUM-237 (the parent sees today's run state and the stops left before their
 * child), written from the ticket and the contract's "Today's run for a child". Never from {@code ParentRunStatusTests}.
 */
class ParentRunStatusCriteriaTests extends RunCriteriaSupport {

	private static final String CHILDREN = "/api/parent/children";

	@Autowired
	private RunRepository runRepository;

	private String children(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get(CHILDREN).with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	/** The child's todayRun as a map, or null. */
	private Map<String, Object> todayRun(UUID parent, UUID child) throws Exception {
		List<Map<String, Object>> runs = JsonPath.read(children(parent), "$[?(@.studentId == '" + child + "')].todayRun");
		assertEquals(1, runs.size(), "child " + child);
		return runs.get(0);
	}

	private static Map<String, Object> shown(String direction, String state, Integer stopsLeft) {
		java.util.HashMap<String, Object> run = new java.util.HashMap<>();
		run.put("direction", direction);
		run.put("state", state);
		run.put("stopsLeft", stopsLeft);
		return run;
	}

	/** Four children on one route; the parent's child is the last stop, so three stops are before them. */
	private record Family(UUID parent, Bus bus, UUID a, UUID b, UUID c, UUID child) {
	}

	private Family aFamilyAtTheLastStop() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID a = aStudent("Adam", null);
		UUID b = aStudent("Bilal", null);
		UUID c = aStudent("Celine", null);
		UUID child = aStudent("Dana", parent);
		onRoute(bus, a, b, c, child);
		return new Family(parent, bus, a, b, c, child);
	}

	// ---------------------------------------------------------------- the state (237, criterion 1)

	/** Contract: before the driver opens today's runs, the morning shows NOT_STARTED, and asking creates no run. */
	@Test
	void beforeTheDriverOpensTheRunsTheMorningShowsNotStartedAndNothingIsCreated() throws Exception {
		Family f = aFamilyAtTheLastStop();
		long runsBefore = runRepository.count();

		assertEquals(shown("MORNING", "NOT_STARTED", null), todayRun(f.parent(), f.child()));
		assertEquals(runsBefore, runRepository.count(), "a parent's GET never creates a run");
	}

	/** Contract "which run": in progress wins; after the morning ends, the afternoon NOT_STARTED; at the end, FINISHED. */
	@Test
	void theShownRunFollowsTheDay() throws Exception {
		Family f = aFamilyAtTheLastStop();
		String morning = runId(f.bus(), "MORNING");
		String afternoon = runId(f.bus(), "AFTERNOON");

		start(f.bus(), morning);
		assertEquals("IN_PROGRESS", todayRun(f.parent(), f.child()).get("state"));
		assertEquals("MORNING", todayRun(f.parent(), f.child()).get("direction"));

		end(f.bus(), morning);
		assertEquals(shown("AFTERNOON", "NOT_STARTED", null), todayRun(f.parent(), f.child()));

		start(f.bus(), afternoon);
		assertEquals("AFTERNOON", todayRun(f.parent(), f.child()).get("direction"));
		assertEquals("IN_PROGRESS", todayRun(f.parent(), f.child()).get("state"));

		end(f.bus(), afternoon);
		assertEquals(shown("AFTERNOON", "FINISHED", null), todayRun(f.parent(), f.child()));
	}

	/** Contract: if both are in progress, the morning one is shown. */
	@Test
	void bothRunsInProgressShowTheMorning() throws Exception {
		Family f = aFamilyAtTheLastStop();
		start(f.bus(), runId(f.bus(), "AFTERNOON"));
		start(f.bus(), runId(f.bus(), "MORNING"));

		assertEquals("MORNING", todayRun(f.parent(), f.child()).get("direction"));
	}

	/** Contract: an afternoon started first is shown while the morning has not started. */
	@Test
	void anAfternoonStartedFirstIsShown() throws Exception {
		Family f = aFamilyAtTheLastStop();
		start(f.bus(), runId(f.bus(), "AFTERNOON"));

		assertEquals("AFTERNOON", todayRun(f.parent(), f.child()).get("direction"));
	}

	/** Contract: todayRun is null for a child with no route, and on a holiday or weekend. */
	@Test
	void todayRunIsNullWithNoRouteAndOnAHolidayOrWeekend() throws Exception {
		Family f = aFamilyAtTheLastStop();
		UUID noRoute = aStudent("Layla", f.parent());

		assertNull(todayRun(f.parent(), noRoute));

		aHoliday(WEDNESDAY);
		assertNull(todayRun(f.parent(), f.child()));

		setNow(LocalDate.of(2026, 11, 7), LocalTime.of(8, 0));
		assertNull(todayRun(f.parent(), f.child()), "Saturday");
	}

	/** Ticket rules: a half-day still shows its run. */
	@Test
	void aHalfDayStillShowsItsRun() throws Exception {
		Family f = aFamilyAtTheLastStop();
		aHalfDay(WEDNESDAY);

		assertEquals(shown("MORNING", "NOT_STARTED", null), todayRun(f.parent(), f.child()));
	}

	// ---------------------------------------------------------------- stops left (237, criterion 2)

	/** 237: the count of stops before the child still to do, dropping as the driver confirms; 0 means next. */
	@Test
	void stopsLeftDropsAsTheDriverConfirmsAndIsZeroWhenTheChildIsNext() throws Exception {
		Family f = aFamilyAtTheLastStop();
		String morning = runId(f.bus(), "MORNING");
		start(f.bus(), morning);

		assertEquals(3, todayRun(f.parent(), f.child()).get("stopsLeft"));
		confirm(f.bus(), morning, f.a(), "PICKED_UP");
		assertEquals(2, todayRun(f.parent(), f.child()).get("stopsLeft"));
		confirm(f.bus(), morning, f.b(), "NOT_PRESENT");
		assertEquals(1, todayRun(f.parent(), f.child()).get("stopsLeft"));
		confirm(f.bus(), morning, f.c(), "PICKED_UP");
		assertEquals(0, todayRun(f.parent(), f.child()).get("stopsLeft"), "0 means the child is next");

		confirm(f.bus(), morning, f.child(), "PICKED_UP");
		assertNull(todayRun(f.parent(), f.child()).get("stopsLeft"), "picked up: no count applies");
	}

	/** Contract: counted by what is still to do, not by position: a later stop picked up first does not count. */
	@Test
	void aStopPickedUpOutOfOrderDoesNotCount() throws Exception {
		Family f = aFamilyAtTheLastStop();
		String morning = runId(f.bus(), "MORNING");
		start(f.bus(), morning);

		confirm(f.bus(), morning, f.c(), "PICKED_UP");

		assertEquals(2, todayRun(f.parent(), f.child()).get("stopsLeft"));
	}

	/** Contract: an absent child's stop before ours does not count, unless the driver confirmed them anyway. */
	@Test
	void anAbsentStopBeforeTheChildDoesNotCountUnlessConfirmed() throws Exception {
		Family f = aFamilyAtTheLastStop();
		UUID otherParent = aParent();
		studentRepository.findById(f.b()).ifPresent(student -> {
			student.setParentUserId(otherParent);
			studentRepository.save(student);
		});
		absentToday(otherParent, f.b());
		String morning = runId(f.bus(), "MORNING");
		start(f.bus(), morning);

		assertEquals(2, todayRun(f.parent(), f.child()).get("stopsLeft"), "the absent stop is skipped");
	}

	/** Contract: the child absent without a confirmation has no count, though the run is in progress. */
	@Test
	void anAbsentChildHasNoCount() throws Exception {
		Family f = aFamilyAtTheLastStop();
		absentToday(f.parent(), f.child());
		start(f.bus(), runId(f.bus(), "MORNING"));

		assertEquals(shown("MORNING", "IN_PROGRESS", null), todayRun(f.parent(), f.child()));
	}

	/** Contract: on the afternoon run the order is reversed, and a child is done only once dropped off. */
	@Test
	void theAfternoonCountsInReverseOrderUntilTheChildIsDroppedOff() throws Exception {
		Family f = aFamilyAtTheLastStop();
		String morning = runId(f.bus(), "MORNING");
		start(f.bus(), morning);
		end(f.bus(), morning);
		String afternoon = runId(f.bus(), "AFTERNOON");
		start(f.bus(), afternoon);

		// Dana, the last morning stop, is the first drop-off: nobody is before her.
		assertEquals(0, todayRun(f.parent(), f.child()).get("stopsLeft"));
		confirm(f.bus(), afternoon, f.child(), "PICKED_UP");
		assertEquals(0, todayRun(f.parent(), f.child()).get("stopsLeft"), "picked up at the gate is not done");
		confirm(f.bus(), afternoon, f.child(), "DROPPED_OFF");
		assertNull(todayRun(f.parent(), f.child()).get("stopsLeft"));

		// Adam, the first morning stop, is the last drop-off.
		UUID adamsParent = aParent();
		studentRepository.findById(f.a()).ifPresent(student -> {
			student.setParentUserId(adamsParent);
			studentRepository.save(student);
		});
		assertEquals(2, todayRun(adamsParent, f.a()).get("stopsLeft"));
	}

	/** Contract: live: a reorder by the head of transportation can make the count go up. */
	@Test
	void aReorderChangesTheCountAtOnce() throws Exception {
		Family f = aFamilyAtTheLastStop();
		start(f.bus(), runId(f.bus(), "MORNING"));
		assertEquals(200, reorder(f.bus().routeId(), f.child(), f.a(), f.b(), f.c()).getStatus());
		assertEquals(0, todayRun(f.parent(), f.child()).get("stopsLeft"));

		assertEquals(200, reorder(f.bus().routeId(), f.a(), f.b(), f.child(), f.c()).getStatus());
		assertEquals(2, todayRun(f.parent(), f.child()).get("stopsLeft"));
	}

	// ---------------------------------------------------------------- ownership (237, criterion 3)

	/** 242 (security): two parents with children on the same bus each see only their own child. */
	@Test
	void twoParentsOnTheSameBusEachSeeOnlyTheirOwnChild() throws Exception {
		Family f = aFamilyAtTheLastStop();
		UUID otherParent = aParent();
		studentRepository.findById(f.a()).ifPresent(student -> {
			student.setParentUserId(otherParent);
			studentRepository.save(student);
		});
		start(f.bus(), runId(f.bus(), "MORNING"));

		assertEquals(List.of(f.child().toString()), JsonPath.read(children(f.parent()), "$[*].studentId"));
		assertEquals(List.of(f.a().toString()), JsonPath.read(children(otherParent), "$[*].studentId"));
		assertEquals(0, todayRun(otherParent, f.a()).get("stopsLeft"));
		assertEquals(3, todayRun(f.parent(), f.child()).get("stopsLeft"));
	}

	/** 242 (security): a parent of another school, even with the same user id, sees no children. */
	@Test
	void aParentOfAnotherSchoolSeesNothing() throws Exception {
		Family f = aFamilyAtTheLastStop();

		String other = send(get(CHILDREN).with(as(Role.PARENT, f.parent(), UUID.randomUUID()))).getContentAsString();

		assertEquals(List.of(), JsonPath.read(other, "$"));
	}
}
