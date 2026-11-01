package com.wassel.backend.absences.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.CriteriaTestSupport;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-239 (absent students on today's run, and the head's list), written for SCRUM-236 from the ticket's acceptance
 * criteria and docs/contracts/runs.md. Absences are reported and cancelled through the parent API, the way a parent does,
 * and the run is read through the driver's and the head's endpoints.
 *
 * <p>Not asserted: "a stop where every student is absent is marked as skippable". The contract defines a stop as one
 * student and says the server sends only {@code absent}; "skippable" is worked out by the screen (absent and no
 * confirmation). So the server side of that criterion is the {@code absent} flag plus {@code counts.absent}, below.
 */
class AbsentOnRunCriteriaTests extends CriteriaTestSupport {

	private final UUID school = UUID.randomUUID();

	private final UUID parent = UUID.randomUUID();

	private final UUID driverUser = UUID.randomUUID();

	private Route route;

	private Student rami;

	private Student salma;

	private Student tarek;

	@BeforeEach
	void aDriverWithThreeStops() {
		Driver driver = driver(school, driverUser, "Karim");
		route = route(school, "Hamra morning run", vehicle(school, 14), driver);
		rami = onRoute(school, parent, route, 1, "Rami");
		salma = onRoute(school, parent, route, 2, "Salma");
		tarek = onRoute(school, parent, route, 3, "Tarek");
	}

	// ---- helpers ----

	private String driverToday() throws Exception {
		return mockMvc.perform(get("/api/driver/runs/today").with(loggedInAs(Role.DRIVER, school, driverUser)))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	private static Map<String, Object> run(String day, String direction) {
		List<Map<String, Object>> runs = JsonPath.read(day, "$.runs");
		return runs.stream().filter(r -> direction.equals(r.get("direction"))).findFirst().orElseThrow();
	}

	@SuppressWarnings("unchecked")
	private static boolean absent(Map<String, Object> run, String firstName) {
		List<Map<String, Object>> stops = (List<Map<String, Object>>) run.get("stops");
		return (Boolean) stops.stream().filter(s -> firstName.equals(s.get("firstName"))).findFirst().orElseThrow().get("absent");
	}

	@SuppressWarnings("unchecked")
	private static int counted(Map<String, Object> run, String key) {
		return (Integer) ((Map<String, Object>) run.get("counts")).get(key);
	}

	private String report(Student student, String from, String to) throws Exception {
		String body = to == null ? "{\"fromDate\":\"%s\"}".formatted(from)
				: "{\"fromDate\":\"%s\",\"toDate\":\"%s\"}".formatted(from, to);
		String response = mockMvc.perform(post("/api/parent/children/" + student.getId() + "/absences")
						.with(loggedInAs(Role.PARENT, school, parent)).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(response, "$.id");
	}

	private void cancel(Student student, String absenceId) throws Exception {
		mockMvc.perform(delete("/api/parent/children/" + student.getId() + "/absences/" + absenceId)
				.with(loggedInAs(Role.PARENT, school, parent))).andExpect(status().isNoContent());
	}

	private String headAbsent(String date) throws Exception {
		var request = get("/api/head-of-transport/absences").with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID()));
		if (date != null) {
			request.param("date", date);
		}
		return mockMvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	// ---- the driver's run ----

	@Test
	void todaysRunMarksOnlyTheStudentWhoIsAbsentToday() throws Exception {
		String before = driverToday();
		assertEquals(0, counted(run(before, "MORNING"), "absent"));

		report(salma, "2026-11-02", null);
		String day = driverToday();

		Map<String, Object> morning = run(day, "MORNING");
		assertEquals(false, absent(morning, "Rami"));
		assertEquals(true, absent(morning, "Salma"));
		assertEquals(false, absent(morning, "Tarek"));
		assertEquals(1, counted(morning, "absent"));
		assertEquals(3, counted(morning, "students"), "an absent student is still a stop on the run");
	}

	@Test
	void anAbsenceCoversTheAfternoonRunToo() throws Exception {
		report(salma, "2026-11-02", null);

		Map<String, Object> afternoon = run(driverToday(), "AFTERNOON");
		assertEquals(true, absent(afternoon, "Salma"));
		assertEquals(1, counted(afternoon, "absent"));
	}

	@Test
	void aRangeThatIncludesTodayMarksTheStudent() throws Exception {
		report(tarek, "2026-11-02", "2026-11-04");
		assertEquals(true, absent(run(driverToday(), "MORNING"), "Tarek"));
	}

	@Test
	void aRangeMarksTheStudentOnEveryDayItCoversAndNotTheDayAfter() throws Exception {
		report(salma, "2026-11-02", "2026-11-04");

		assertEquals(true, absent(run(driverToday(), "MORNING"), "Salma"), "Monday, the first day");
		clock.set(Instant.parse("2026-11-03T08:00:00Z"));
		assertEquals(true, absent(run(driverToday(), "MORNING"), "Salma"), "Tuesday, the middle day");
		clock.set(Instant.parse("2026-11-04T08:00:00Z"));
		assertEquals(true, absent(run(driverToday(), "MORNING"), "Salma"), "Wednesday, the last day");
		clock.set(Instant.parse("2026-11-05T08:00:00Z"));
		assertEquals(false, absent(run(driverToday(), "MORNING"), "Salma"), "Thursday, the day after");
	}

	@Test
	void cancellingPartWayThroughARangeClearsTheRestOfIt() throws Exception {
		String id = report(salma, "2026-11-02", "2026-11-04");
		clock.set(Instant.parse("2026-11-03T08:00:00Z"));
		assertEquals(true, absent(run(driverToday(), "MORNING"), "Salma"));

		cancel(salma, id);

		assertEquals(false, absent(run(driverToday(), "MORNING"), "Salma"), "Tuesday, after cancelling");
		clock.set(Instant.parse("2026-11-04T08:00:00Z"));
		assertEquals(false, absent(run(driverToday(), "MORNING"), "Salma"), "Wednesday");
	}

	@Test
	void anAbsenceOnAnotherDayDoesNotMarkToday() throws Exception {
		report(salma, "2026-11-03", null);
		assertEquals(false, absent(run(driverToday(), "MORNING"), "Salma"));
	}

	@Test
	void anAbsenceReportedAfterTheRunStartedShowsOnTheNextFetch() throws Exception {
		Map<String, Object> morning = run(driverToday(), "MORNING");
		assertEquals(false, absent(morning, "Salma"));
		mockMvc.perform(post("/api/driver/runs/" + morning.get("id") + "/start")
				.with(loggedInAs(Role.DRIVER, school, driverUser))).andExpect(status().isOk());

		report(salma, "2026-11-02", null);

		Map<String, Object> started = run(driverToday(), "MORNING");
		assertEquals("IN_PROGRESS", started.get("state"));
		assertEquals(true, absent(started, "Salma"));
	}

	@Test
	void aCancelledAbsenceIsNotShown() throws Exception {
		String id = report(salma, "2026-11-02", null);
		assertEquals(true, absent(run(driverToday(), "MORNING"), "Salma"));

		cancel(salma, id);

		Map<String, Object> morning = run(driverToday(), "MORNING");
		assertEquals(false, absent(morning, "Salma"));
		assertEquals(0, counted(morning, "absent"));
	}

	@Test
	void anAbsentStudentTheDriverStillPickedUpIsCountedAsPickedUpNotAbsent() throws Exception {
		Map<String, Object> morning = run(driverToday(), "MORNING");
		mockMvc.perform(post("/api/driver/runs/" + morning.get("id") + "/start")
				.with(loggedInAs(Role.DRIVER, school, driverUser))).andExpect(status().isOk());
		report(salma, "2026-11-02", null);
		mockMvc.perform(put("/api/driver/runs/" + morning.get("id") + "/students/" + salma.getId() + "/confirmation")
				.with(loggedInAs(Role.DRIVER, school, driverUser)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"status\":\"PICKED_UP\"}")).andExpect(status().isOk());

		Map<String, Object> after = run(driverToday(), "MORNING");
		assertEquals(true, absent(after, "Salma"), "the stop keeps the parent's report");
		assertEquals(0, counted(after, "absent"), "a confirmation wins in the counts");
		assertEquals(1, counted(after, "pickedUp"));
	}

	// ---- the head of transportation's list of who is absent today ----

	@Test
	void theHeadSeesWhoIsAbsentTodayWithTheirRouteAndStop() throws Exception {
		report(salma, "2026-11-02", null);

		String list = headAbsent(null);

		assertEquals(1, ((List<?>) JsonPath.read(list, "$[?(@.studentId=='" + salma.getId() + "')]")).size());
		assertEquals("Salma", JsonPath.<List<String>>read(list, "$[?(@.studentId=='" + salma.getId() + "')].firstName").get(0));
		assertEquals(route.getId().toString(), JsonPath.<List<String>>read(list, "$[?(@.studentId=='" + salma.getId() + "')].route.id").get(0));
		assertEquals("Hamra morning run", JsonPath.<List<String>>read(list, "$[?(@.studentId=='" + salma.getId() + "')].route.name").get(0));
		assertEquals(2, JsonPath.<List<Integer>>read(list, "$[?(@.studentId=='" + salma.getId() + "')].position").get(0));
		assertEquals(0, ((List<?>) JsonPath.read(list, "$[?(@.studentId=='" + rami.getId() + "')]")).size());
	}

	@Test
	void theHeadsStopNumberIsTheStudentsPlaceOnTheRouteNotAGapLeftByAStudentWhoLeft() throws Exception {
		mockMvc.perform(delete("/api/head-of-transport/routes/" + route.getId() + "/students/" + rami.getId())
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID()))).andExpect(status().is2xxSuccessful());
		report(salma, "2026-11-02", null);
		report(tarek, "2026-11-02", null);

		String list = headAbsent(null);

		assertEquals(1, JsonPath.<List<Integer>>read(list, "$[?(@.studentId=='" + salma.getId() + "')].position").get(0));
		assertEquals(2, JsonPath.<List<Integer>>read(list, "$[?(@.studentId=='" + tarek.getId() + "')].position").get(0));
	}

	@Test
	void anAbsentStudentWithNoRouteIsListedWithNoRouteAndNoStop() throws Exception {
		Student layla = child(school, parent, "Layla");
		report(layla, "2026-11-02", null);

		String list = headAbsent(null);

		List<Map<String, Object>> hits = JsonPath.read(list, "$[?(@.studentId=='" + layla.getId() + "')]");
		assertEquals(1, hits.size());
		assertNull(hits.get(0).get("route"));
		assertNull(hits.get(0).get("position"));
	}

	@Test
	void theHeadsListLeavesOutCancelledAbsencesAndOtherDays() throws Exception {
		String cancelled = report(rami, "2026-11-02", null);
		report(tarek, "2026-11-03", null);
		cancel(rami, cancelled);

		String today = headAbsent(null);
		assertEquals(0, ((List<?>) JsonPath.read(today, "$[?(@.studentId=='" + rami.getId() + "')]")).size());
		assertEquals(0, ((List<?>) JsonPath.read(today, "$[?(@.studentId=='" + tarek.getId() + "')]")).size());
		assertEquals(1, ((List<?>) JsonPath.read(headAbsent("2026-11-03"), "$[?(@.studentId=='" + tarek.getId() + "')]")).size());
	}
}
