package com.wassel.backend.reports.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SCRUM-271, against {@code docs/contracts/transport-totals.md}. The figures come from real runs, confirmations and
 * absences made through the endpoints, on the run tests' fixtures (a fresh school each test, "now" Wednesday
 * 2026-11-04 at 07:00 in Beirut).
 */
class TransportTotalsTests extends RunCriteriaSupport {

	private static final String TOTALS = "/api/head-of-transport/transport-totals";

	private static final String TODAY = "2026-11-04";

	// --- fixtures -----------------------------------------------------------------------------

	private MockHttpServletResponse totals(String query) throws Exception {
		return send(get(TOTALS + query).with(head()));
	}

	private String totalsOk(String query) throws Exception {
		MockHttpServletResponse response = totals(query);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private MockHttpServletResponse export(String query) throws Exception {
		return send(get(TOTALS + "/export" + query).with(head()));
	}

	private long number(String body, String path) {
		return ((Number) JsonPath.read(body, path)).longValue();
	}

	private void confirmOk(Bus bus, String runId, UUID student, String status) throws Exception {
		MockHttpServletResponse response = confirm(bus, runId, student, status);
		assertEquals(200, response.getStatus(), response.getContentAsString());
	}

	/**
	 * Wednesday: one route with Ami, Bo and Cy, and a parent's child Di who is not on it. Morning: Ami picked up and
	 * dropped off, Bo picked up, Cy not present, and the run ended. Afternoon: Ami picked up again, the run still
	 * going. Di is reported absent today.
	 */
	private Bus aBusyWednesday() throws Exception {
		Bus bus = aBus("Hamra");
		UUID ami = aStudent("Ami", null);
		UUID bo = aStudent("Bo", null);
		UUID cy = aStudent("Cy", null);
		onRoute(bus, ami, bo, cy);
		String morning = runId(bus, "MORNING");
		assertEquals(200, start(bus, morning).getStatus());
		confirmOk(bus, morning, ami, "PICKED_UP");
		confirmOk(bus, morning, ami, "DROPPED_OFF");
		confirmOk(bus, morning, bo, "PICKED_UP");
		confirmOk(bus, morning, cy, "NOT_PRESENT");
		assertEquals(200, end(bus, morning).getStatus());
		String afternoon = runId(bus, "AFTERNOON");
		assertEquals(200, start(bus, afternoon).getStatus());
		confirmOk(bus, afternoon, ami, "PICKED_UP");
		UUID parent = aParent();
		absentToday(parent, aStudent("Di", parent));
		return bus;
	}

	// --- the figures --------------------------------------------------------------------------

	@Test
	void anEmptySchoolHasOneDayOfZerosForToday() throws Exception {
		String body = totalsOk("");

		assertEquals(TODAY, JsonPath.read(body, "$.from"));
		assertEquals(TODAY, JsonPath.read(body, "$.to"));
		assertEquals(1, ((List<?>) JsonPath.read(body, "$.days")).size());
		assertEquals(TODAY, JsonPath.read(body, "$.days[0].date"));
		for (String field : List.of("runs", "runsFinished", "pickedUp", "droppedOff", "notPresent", "absent")) {
			assertEquals(0, number(body, "$.days[0]." + field), field);
			assertEquals(0, number(body, "$.total." + field), field);
		}
		assertEquals(0, number(body, "$.studentsOnRoutes"));
	}

	@Test
	void theFiguresComeFromTheRunsConfirmationsAndAbsencesOfTheDay() throws Exception {
		aBusyWednesday();

		String body = totalsOk("");

		assertEquals(2, number(body, "$.days[0].runs"));
		assertEquals(1, number(body, "$.days[0].runsFinished"));
		assertEquals(2, number(body, "$.days[0].pickedUp"), "Ami twice and Bo: two different students");
		assertEquals(1, number(body, "$.days[0].droppedOff"));
		assertEquals(1, number(body, "$.days[0].notPresent"));
		assertEquals(1, number(body, "$.days[0].absent"));
		assertEquals(3, number(body, "$.studentsOnRoutes"), "Di is not on a route");
		for (String field : List.of("runs", "runsFinished", "pickedUp", "droppedOff", "notPresent", "absent")) {
			assertEquals(number(body, "$.days[0]." + field), number(body, "$.total." + field), field);
		}
	}

	@Test
	void aStudentNotPresentWhoIsThenPickedUpIsNotCountedAsNotPresent() throws Exception {
		Bus bus = aBus("Hamra");
		UUID ami = aStudent("Ami", null);
		onRoute(bus, ami);
		String morning = runId(bus, "MORNING");
		assertEquals(200, start(bus, morning).getStatus());
		confirmOk(bus, morning, ami, "NOT_PRESENT");
		confirmOk(bus, morning, ami, "PICKED_UP");

		String body = totalsOk("");

		assertEquals(0, number(body, "$.days[0].notPresent"));
		assertEquals(1, number(body, "$.days[0].pickedUp"));
	}

	@Test
	void aCancelledAbsenceIsNotCounted() throws Exception {
		UUID parent = aParent();
		UUID child = aStudent("Di", parent);
		MockHttpServletResponse reported = send(post("/api/parent/children/" + child + "/absences")
				.with(as(Role.PARENT, parent)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"fromDate\":\"2026-11-05\",\"toDate\":\"2026-11-06\"}"));
		assertEquals(201, reported.getStatus(), reported.getContentAsString());
		String id = JsonPath.read(reported.getContentAsString(), "$.id");

		assertEquals(1, number(totalsOk("?from=2026-11-05&to=2026-11-05"), "$.days[0].absent"));

		assertEquals(204, send(delete("/api/parent/children/" + child + "/absences/" + id)
				.with(as(Role.PARENT, parent))).getStatus());
		assertEquals(0, number(totalsOk("?from=2026-11-05&to=2026-11-05"), "$.days[0].absent"));
	}

	@Test
	void aRangeListsEveryDateAndTheTotalAddsThemUp() throws Exception {
		aBusyWednesday();

		String body = totalsOk("?from=2026-11-03&to=2026-11-05");

		assertEquals(List.of("2026-11-03", "2026-11-04", "2026-11-05"), JsonPath.read(body, "$.days[*].date"));
		assertEquals(0, number(body, "$.days[0].runs"));
		assertEquals(2, number(body, "$.days[1].runs"));
		assertEquals(0, number(body, "$.days[2].runs"));
		assertEquals(2, number(body, "$.total.runs"));
		assertEquals(2, number(body, "$.total.pickedUp"));
		assertEquals(1, number(body, "$.total.absent"));
	}

	@Test
	void anAbsenceOverSeveralDaysCountsOnEachOfThem() throws Exception {
		UUID parent = aParent();
		UUID child = aStudent("Di", parent);
		MockHttpServletResponse reported = send(post("/api/parent/children/" + child + "/absences")
				.with(as(Role.PARENT, parent)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"fromDate\":\"2026-11-04\",\"toDate\":\"2026-11-06\"}"));
		assertEquals(201, reported.getStatus());

		String body = totalsOk("?from=2026-11-03&to=2026-11-07");

		assertEquals(List.of(0, 1, 1, 1, 0), JsonPath.<List<Integer>>read(body, "$.days[*].absent"));
		assertEquals(3, number(body, "$.total.absent"), "student-days, not different students");
	}

	@Test
	void studentsOnRoutesCountsActiveStudentsOnARouteOnly() throws Exception {
		Bus bus = aBus("Hamra");
		UUID ami = aStudent("Ami", null);
		UUID bo = aStudent("Bo", null);
		onRoute(bus, ami, bo);
		Student inactive = studentRepository.findById(bo).orElseThrow();
		inactive.setStatus(StudentStatus.INACTIVE);
		studentRepository.save(inactive);
		aStudent("Cy", null);

		assertEquals(1, number(totalsOk(""), "$.studentsOnRoutes"));
	}

	@Test
	void anotherSchoolsDataIsNeverCounted() throws Exception {
		aBusyWednesday();

		MockHttpServletResponse other = send(get(TOTALS).with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(),
				UUID.randomUUID())));

		assertEquals(200, other.getStatus());
		String body = other.getContentAsString();
		assertEquals(0, number(body, "$.total.runs"));
		assertEquals(0, number(body, "$.total.pickedUp"));
		assertEquals(0, number(body, "$.total.absent"));
		assertEquals(0, number(body, "$.studentsOnRoutes"));
	}

	@Test
	void aFutureDateIsAllZeros() throws Exception {
		aBusyWednesday();

		String body = totalsOk("?from=2030-01-01&to=2030-01-01");

		assertEquals(0, number(body, "$.total.runs"));
		assertEquals(0, number(body, "$.total.pickedUp"));
	}

	// --- the range ----------------------------------------------------------------------------

	@Test
	void aToDefaultsToFromAndAToAloneIsComparedWithToday() throws Exception {
		assertEquals("2026-11-06", JsonPath.read(totalsOk("?from=2026-11-06"), "$.to"));

		MockHttpServletResponse past = totals("?to=2026-11-03");
		assertEquals(400, past.getStatus(), "to defaults from to today, and today is after 2026-11-03");
	}

	@Test
	void aBadRangeIsRefusedOnTo() throws Exception {
		LocalDate from = LocalDate.of(2026, 9, 1);
		for (String query : List.of("?from=2026-11-05&to=2026-11-04", "?from=" + from + "&to=" + from.plusDays(62))) {
			MockHttpServletResponse response = totals(query);
			assertEquals(400, response.getStatus(), query);
			assertTrue(response.getContentAsString().contains("\"to\""), query);
			assertEquals(400, export(query).getStatus(), query);
		}
		assertEquals(200, totals("?from=" + from + "&to=" + from.plusDays(61)).getStatus(), "62 days is allowed");
	}

	@Test
	void aMalformedDateIsRefused() throws Exception {
		assertEquals(400, totals("?from=yesterday").getStatus());
		assertEquals(400, totals("?from=2026-11-04&to=11/05/2026").getStatus());
		assertEquals(400, export("?from=2026-13-40").getStatus());
	}

	// --- the export ---------------------------------------------------------------------------

	@Test
	void theExportHoldsTheSameFiguresAsTheTotals() throws Exception {
		aBusyWednesday();
		String query = "?from=2026-11-03&to=2026-11-05";
		String body = totalsOk(query);

		MockHttpServletResponse response = export(query);

		assertEquals(200, response.getStatus());
		assertTrue(response.getContentType().startsWith("text/csv"), response.getContentType());
		assertTrue(response.getHeader("Content-Disposition").contains("attachment"));
		assertTrue(response.getHeader("Content-Disposition").contains("wassel-transport-2026-11-03_2026-11-05.csv"));
		String[] lines = response.getContentAsString().split("\r\n");
		assertEquals(5, lines.length, "header, three dates and the total");
		assertEquals("date,runs,runsFinished,pickedUp,droppedOff,notPresent,absent", lines[0]);
		for (int i = 0; i < 3; i++) {
			assertEquals(row(JsonPath.read(body, "$.days[" + i + "].date"), body, "$.days[" + i + "]."), lines[i + 1]);
		}
		assertEquals(row("TOTAL", body, "$.total."), lines[4]);
	}

	@Test
	void anEmptyExportHasTheHeaderTheDayAndTheTotal() throws Exception {
		MockHttpServletResponse response = export("");

		assertEquals(200, response.getStatus());
		assertEquals("date,runs,runsFinished,pickedUp,droppedOff,notPresent,absent\r\n"
				+ TODAY + ",0,0,0,0,0,0\r\nTOTAL,0,0,0,0,0,0\r\n", response.getContentAsString());
	}

	private String row(String label, String body, String prefix) {
		return label + "," + number(body, prefix + "runs") + "," + number(body, prefix + "runsFinished") + ","
				+ number(body, prefix + "pickedUp") + "," + number(body, prefix + "droppedOff") + ","
				+ number(body, prefix + "notPresent") + "," + number(body, prefix + "absent");
	}
}
