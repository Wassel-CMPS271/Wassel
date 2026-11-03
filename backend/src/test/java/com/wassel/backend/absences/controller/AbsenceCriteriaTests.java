package com.wassel.backend.absences.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.CriteriaTestSupport;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-238 (absences API), written for SCRUM-236 from the ticket's acceptance criteria and the "Absences" rules and
 * errors of docs/contracts/runs.md, not from {@code AbsenceControllerTests} or the module's code. Everything goes through
 * HTTP; the clock is Monday 2026-11-02 and a test moves it to make an absence "in progress" or "over".
 *
 * <p>Two simultaneous reports of one child are in {@link AbsenceRaceCriteriaTests}, which fails today on a known bug.
 */
class AbsenceCriteriaTests extends CriteriaTestSupport {

	private static final Instant WEDNESDAY = Instant.parse("2026-11-04T08:00:00Z");

	private static final Instant FRIDAY = Instant.parse("2026-11-06T08:00:00Z");

	private final UUID school = UUID.randomUUID();

	private final UUID parent = UUID.randomUUID();

	private Student layla;

	@BeforeEach
	void aChild() {
		layla = child(school, parent, "Layla");
	}

	// ---- helpers ----

	private static String url(UUID studentId) {
		return "/api/parent/children/" + studentId + "/absences";
	}

	private static String days(String from, String to) {
		return to == null ? "{\"fromDate\":\"%s\"}".formatted(from)
				: "{\"fromDate\":\"%s\",\"toDate\":\"%s\"}".formatted(from, to);
	}

	private ResultActions report(UUID school, UUID asParent, UUID studentId, String json) throws Exception {
		return mockMvc.perform(post(url(studentId)).with(loggedInAs(Role.PARENT, school, asParent))
				.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private ResultActions report(String from, String to) throws Exception {
		return report(school, parent, layla.getId(), days(from, to));
	}

	private ResultActions list(UUID school, UUID asParent, UUID studentId) throws Exception {
		return mockMvc.perform(get(url(studentId)).with(loggedInAs(Role.PARENT, school, asParent)));
	}

	private ResultActions list() throws Exception {
		return list(school, parent, layla.getId());
	}

	private ResultActions cancel(UUID school, UUID asParent, UUID studentId, String absenceId) throws Exception {
		return mockMvc.perform(delete(url(studentId) + "/" + absenceId).with(loggedInAs(Role.PARENT, school, asParent)));
	}

	private String reported(String from, String to) throws Exception {
		String body = report(from, to).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	private String headList(UUID headSchool, String date) throws Exception {
		return mockMvc.perform(get("/api/head-of-transport/absences").param("date", date)
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, headSchool, UUID.randomUUID())))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	private static int count(String json, UUID studentId) {
		List<?> hits = JsonPath.read(json, "$[?(@.studentId=='" + studentId + "')]");
		return hits.size();
	}

	// ---- report: a day, a range, the dates ----

	@Test
	void aParentReportsOneDayForTheirChild() throws Exception {
		report("2026-11-03", null).andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").exists())
				.andExpect(jsonPath("$.studentId").value(layla.getId().toString()))
				.andExpect(jsonPath("$.fromDate").value("2026-11-03"))
				.andExpect(jsonPath("$.toDate").value("2026-11-03"));
	}

	@Test
	void aParentReportsARangeOfDays() throws Exception {
		report("2026-11-03", "2026-11-05").andExpect(status().isCreated())
				.andExpect(jsonPath("$.fromDate").value("2026-11-03"))
				.andExpect(jsonPath("$.toDate").value("2026-11-05"));
	}

	@Test
	void todayIsAllowedButYesterdayIsNot() throws Exception {
		report("2026-11-02", null).andExpect(status().isCreated());
		report("2026-11-01", null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.fromDate").exists());
	}

	@Test
	void aRangeThatEndsBeforeItStartsIsRejected() throws Exception {
		report("2026-11-05", "2026-11-03").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.toDate").exists());
	}

	@Test
	void aMissingFromDateIsRejected() throws Exception {
		report(school, parent, layla.getId(), "{}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.fromDate").exists());
	}

	@Test
	void aDateThatIsNotADateIsMalformed() throws Exception {
		report(school, parent, layla.getId(), "{\"fromDate\":\"11/03/2026\"}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Malformed request body"));
	}

	@Test
	void anIdThatIsNotAUuidIsAnInvalidParameter() throws Exception {
		mockMvc.perform(get("/api/parent/children/not-a-uuid/absences").with(loggedInAs(Role.PARENT, school, parent)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Invalid request parameter"));
	}

	@Test
	void todayIsTheDateInBeirutNotInUtc() throws Exception {
		// 22:30 UTC on Sunday is 00:30 on Monday 2 November in Beirut: Monday is today, Sunday is already gone.
		clock.set(Instant.parse("2026-11-01T22:30:00Z"));
		report("2026-11-02", null).andExpect(status().isCreated());
		report("2026-11-01", null).andExpect(status().isBadRequest());
	}

	// ---- overlap rule ----

	@Test
	void anExactRepeatIsTheSameAbsenceAndWritesNothing() throws Exception {
		String id = reported("2026-11-03", "2026-11-05");

		report("2026-11-03", "2026-11-05").andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
		list().andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void aSingleDayRepeatedWithAnExplicitEqualToDateIsStillARepeat() throws Exception {
		String id = reported("2026-11-03", null);

		report("2026-11-03", "2026-11-03").andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
		list().andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void anyOtherOverlapIsRefusedAndNamesTheDateField() throws Exception {
		reported("2026-11-03", "2026-11-05");

		report("2026-11-05", "2026-11-07").andExpect(status().isConflict()).andExpect(jsonPath("$.errors.fromDate").exists());
		report("2026-11-04", null).andExpect(status().isConflict());
		report("2026-11-02", "2026-11-09").andExpect(status().isConflict());
		list().andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void absencesThatOnlyTouchAreBothKept() throws Exception {
		reported("2026-11-03", "2026-11-05");
		reported("2026-11-06", "2026-11-07");
		list().andExpect(jsonPath("$.length()").value(2));
	}

	@Test
	void twoChildrenCanBeAbsentTheSameDay() throws Exception {
		Student omar = child(school, parent, "Omar");
		reported("2026-11-03", null);
		report(school, parent, omar.getId(), days("2026-11-03", null)).andExpect(status().isCreated());
	}

	// ---- list ----

	@Test
	void theListIsUpcomingAbsencesOrderedByFromDate() throws Exception {
		reported("2026-11-10", null);
		reported("2026-11-03", null);

		list().andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].fromDate").value("2026-11-03"))
				.andExpect(jsonPath("$[1].fromDate").value("2026-11-10"));
	}

	@Test
	void anAbsenceThatIsOverIsNotListedButOneInProgressIs() throws Exception {
		reported("2026-11-03", null);
		reported("2026-11-04", "2026-11-09");

		clock.set(FRIDAY);
		list().andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].fromDate").value("2026-11-04"));
	}

	// ---- cancel ----

	@Test
	void cancellingAnUpcomingAbsenceRemovesItAndFreesTheDates() throws Exception {
		String id = reported("2026-11-03", "2026-11-05");

		cancel(school, parent, layla.getId(), id).andExpect(status().isNoContent());
		list().andExpect(jsonPath("$.length()").value(0));
		assertEquals(0, count(headList(school, "2026-11-04"), layla.getId()));
		report("2026-11-03", "2026-11-05").andExpect(status().isCreated());
	}

	@Test
	void cancellingTheSameAbsenceTwiceIsNotFound() throws Exception {
		String id = reported("2026-11-03", null);
		cancel(school, parent, layla.getId(), id).andExpect(status().isNoContent());
		cancel(school, parent, layla.getId(), id).andExpect(status().isNotFound());
	}

	@Test
	void cancellingAnAbsenceInProgressKeepsTheDaysAlreadyGone() throws Exception {
		String id = reported("2026-11-03", "2026-11-05");

		clock.set(WEDNESDAY);
		cancel(school, parent, layla.getId(), id).andExpect(status().isNoContent());

		// Tuesday 3 November was a real absence day: it stays recorded. From Wednesday on it no longer counts.
		assertEquals(1, count(headList(school, "2026-11-03"), layla.getId()));
		assertEquals(0, count(headList(school, "2026-11-04"), layla.getId()));
		assertEquals(0, count(headList(school, "2026-11-05"), layla.getId()));
		list().andExpect(jsonPath("$.length()").value(0));
		// Cut to yesterday, it has "ended before today" (contract, Absences and Errors): a second cancel is a 409, not a 404.
		cancel(school, parent, layla.getId(), id).andExpect(status().isConflict());
		assertEquals(1, count(headList(school, "2026-11-03"), layla.getId()), "and the recorded day is still there");
	}

	@Test
	void cancellingAnAbsenceThatEndedBeforeTodayIsAConflict() throws Exception {
		String id = reported("2026-11-03", null);

		clock.set(FRIDAY);
		cancel(school, parent, layla.getId(), id).andExpect(status().isConflict());
	}

	// ---- ownership (security) ----

	@Test
	void aParentCannotReadAnotherFamilysChildAbsences() throws Exception {
		String id = reported("2026-11-03", null);
		UUID stranger = UUID.randomUUID();
		child(school, stranger, "Stranger's own child");

		String body = list(school, stranger, layla.getId()).andExpect(status().isNotFound())
				.andReturn().getResponse().getContentAsString();
		assertFalse(body.contains(id), "the absence must not leak in the error");
		list().andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(id));
	}

	@Test
	void aParentCannotReportAbsenceForAnotherFamilysChild() throws Exception {
		UUID stranger = UUID.randomUUID();

		report(school, stranger, layla.getId(), days("2026-11-03", null)).andExpect(status().isNotFound());
		list().andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void aParentCannotCancelAnotherFamilysChildAbsence() throws Exception {
		String id = reported("2026-11-03", null);
		UUID stranger = UUID.randomUUID();

		cancel(school, stranger, layla.getId(), id).andExpect(status().isNotFound());
		list().andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(id));
	}

	@Test
	void anUnknownChildIsNotFoundForEveryAction() throws Exception {
		UUID unknown = UUID.randomUUID();

		list(school, parent, unknown).andExpect(status().isNotFound());
		report(school, parent, unknown, days("2026-11-03", null)).andExpect(status().isNotFound());
		cancel(school, parent, unknown, UUID.randomUUID().toString()).andExpect(status().isNotFound());
		assertEquals(0, count(headList(school, "2026-11-03"), unknown), "nothing was written for the unknown id");
	}

	@Test
	void anAbsenceIdUnderTheWrongChildIsNotFoundEvenForTheSameParent() throws Exception {
		Student omar = child(school, parent, "Omar");
		String laylasAbsence = reported("2026-11-03", null);

		cancel(school, parent, omar.getId(), laylasAbsence).andExpect(status().isNotFound());
		list().andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void theSameUserIdInAnotherSchoolDoesNotOwnTheChild() throws Exception {
		String id = reported("2026-11-03", null);
		UUID otherSchool = UUID.randomUUID();

		list(otherSchool, parent, layla.getId()).andExpect(status().isNotFound());
		report(otherSchool, parent, layla.getId(), days("2026-11-10", null)).andExpect(status().isNotFound());
		cancel(otherSchool, parent, layla.getId(), id).andExpect(status().isNotFound());
		list().andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void aStudentNobodyIsLinkedToBelongsToNoParent() throws Exception {
		Student unlinked = child(school, null, "Unlinked");

		list(school, parent, unlinked.getId()).andExpect(status().isNotFound());
		report(school, parent, unlinked.getId(), days("2026-11-03", null)).andExpect(status().isNotFound());
		assertEquals(0, count(headList(school, "2026-11-03"), unlinked.getId()), "nothing was written for it");
	}

	@Test
	void onlyAParentMayUseTheParentEndpointsAndOnlyTheHeadMayListBySchool() throws Exception {
		String id = reported("2026-11-03", null);
		for (Role role : List.of(Role.HEAD_OF_TRANSPORT, Role.DRIVER, Role.ADMIN)) {
			RequestPostProcessor as = loggedInAs(role, school, parent);
			mockMvc.perform(get(url(layla.getId())).with(as)).andExpect(status().isForbidden());
			mockMvc.perform(post(url(layla.getId())).with(as).contentType(MediaType.APPLICATION_JSON)
					.content(days("2026-11-10", null))).andExpect(status().isForbidden());
			mockMvc.perform(delete(url(layla.getId()) + "/" + id).with(as)).andExpect(status().isForbidden());
		}
		mockMvc.perform(get(url(layla.getId()))).andExpect(status().isUnauthorized());
		mockMvc.perform(post(url(layla.getId())).contentType(MediaType.APPLICATION_JSON).content(days("2026-11-10", null)))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(delete(url(layla.getId()) + "/" + id)).andExpect(status().isUnauthorized());
		list().andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(id));
		for (Role role : List.of(Role.PARENT, Role.DRIVER, Role.ADMIN)) {
			mockMvc.perform(get("/api/head-of-transport/absences").with(loggedInAs(role, school, parent)))
					.andExpect(status().isForbidden());
		}
	}

	// ---- the head of transportation's list for a date ----

	@Test
	void theHeadListsEveryAbsenceCoveringADate() throws Exception {
		reported("2026-11-03", "2026-11-05");

		String onTheMiddleDay = headList(school, "2026-11-04");
		assertEquals(1, count(onTheMiddleDay, layla.getId()));
		assertEquals("Layla", JsonPath.<String>read(onTheMiddleDay, "$[0].firstName"));
		assertEquals("2026-11-03", JsonPath.<String>read(onTheMiddleDay, "$[0].fromDate"));
		assertEquals("2026-11-05", JsonPath.<String>read(onTheMiddleDay, "$[0].toDate"));
		assertEquals(0, count(headList(school, "2026-11-02"), layla.getId()));
		assertEquals(0, count(headList(school, "2026-11-06"), layla.getId()));
	}

	@Test
	void aHeadOnlySeesTheirOwnSchoolsAbsences() throws Exception {
		reported("2026-11-03", null);
		assertEquals(0, count(headList(UUID.randomUUID(), "2026-11-03"), layla.getId()));
	}
}
