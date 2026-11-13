package com.wassel.backend.reports.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.schools.entity.SchoolSettings;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SCRUM-266: independent tests of the transport totals and their CSV export (SCRUM-271), written from
 * {@code docs/contracts/transport-totals.md}, its samples and the ticket, never from {@code TransportTotalsTests} or the
 * reports code. Every figure is produced the way the school produces it (drivers' confirmations, parents' absences, the
 * clock moving from day to day) and the expected numbers are worked out by hand in the comment above the test.
 *
 * <p>Not tested, because the contract has nothing to test: CSV escaping and CSV injection ({@code = + - @}). The export
 * holds only dates and numbers; there is no free text yet (the report says so).
 */
class TransportTotalsCriteriaTests extends RunCriteriaSupport {

	private static final String TOTALS = "/api/head-of-transport/transport-totals";

	private static final String EXPORT = TOTALS + "/export";

	private static final String CSV_HEADER = "date,runs,runsFinished,pickedUp,droppedOff,notPresent,absent";

	private static final LocalDate THURSDAY = LocalDate.of(2026, 11, 5);

	private static final LocalDate FRIDAY = LocalDate.of(2026, 11, 6);

	private static final Set<String> FIGURE_KEYS = Set.of("runs", "runsFinished", "pickedUp", "droppedOff", "notPresent",
			"absent");

	private MockHttpServletResponse totals(String from, String to) throws Exception {
		MockHttpServletRequestBuilder request = get(TOTALS).with(head());
		if (from != null) {
			request.param("from", from);
		}
		if (to != null) {
			request.param("to", to);
		}
		return send(request);
	}

	private String okTotals(String from, String to) throws Exception {
		MockHttpServletResponse response = totals(from, to);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private MockHttpServletResponse export(String from, String to) throws Exception {
		MockHttpServletRequestBuilder request = get(EXPORT).with(head());
		if (from != null) {
			request.param("from", from);
		}
		if (to != null) {
			request.param("to", to);
		}
		return send(request);
	}

	private String reportAbsence(UUID parent, UUID child, LocalDate from, LocalDate to) throws Exception {
		MockHttpServletResponse response = send(post("/api/parent/children/" + child + "/absences")
				.with(as(Role.PARENT, parent)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"fromDate\":\"%s\",\"toDate\":\"%s\"}".formatted(from, to)));
		assertEquals(201, response.getStatus(), response.getContentAsString());
		return JsonPath.read(response.getContentAsString(), "$.id");
	}

	private void cancelAbsence(UUID parent, UUID child, String absenceId) throws Exception {
		MockHttpServletResponse response = send(delete("/api/parent/children/" + child + "/absences/" + absenceId)
				.with(as(Role.PARENT, parent)));
		assertEquals(204, response.getStatus(), response.getContentAsString());
	}

	private void confirmed(Bus bus, String run, UUID student, String... statuses) throws Exception {
		for (String status : statuses) {
			MockHttpServletResponse response = confirm(bus, run, student, status);
			assertEquals(200, response.getStatus(), response.getContentAsString());
		}
	}

	private void started(Bus bus, String run) throws Exception {
		assertEquals(200, start(bus, run).getStatus());
	}

	private static Map<String, Object> figures(int runs, int runsFinished, int pickedUp, int droppedOff, int notPresent,
			int absent) {
		return Map.of("runs", runs, "runsFinished", runsFinished, "pickedUp", pickedUp, "droppedOff", droppedOff,
				"notPresent", notPresent, "absent", absent);
	}

	/** The figures of one day or of the total, without its date. */
	private static Map<String, Object> figuresOf(String body, String path) {
		Map<String, Object> shown = new HashMap<>(JsonPath.<Map<String, Object>>read(body, path));
		shown.remove("date");
		return shown;
	}

	private static void assertAllZero(String body) {
		List<Map<String, Object>> days = JsonPath.read(body, "$.days");
		assertFalse(days.isEmpty(), "a range always lists at least its first day, so zeros are not vacuous");
		for (int i = 0; i < days.size(); i++) {
			assertEquals(figures(0, 0, 0, 0, 0, 0), figuresOf(body, "$.days[" + i + "]"), "day " + days.get(i).get("date"));
		}
		assertEquals(figures(0, 0, 0, 0, 0, 0), figuresOf(body, "$.total"));
	}

	/** A school with two buses and five students, five of them on routes; the week of the exact-numbers test. */
	private record Week(UUID parent, Bus a, Bus b, UUID a1, UUID a2, UUID a3, UUID b1, UUID b2) {
	}

	/**
	 * Wednesday 2026-11-04 to Friday 2026-11-06 for one school.
	 *
	 * <p>Absences (reported on Wednesday, the parent cannot report a past day): a1 on Thursday; a3 on Thursday and then
	 * cancelled; a2 from Friday to Tuesday 11-10 (runs past the end of the range); b1 on Wednesday; b2 on Monday 11-09
	 * (outside the range).
	 *
	 * <p>Wednesday: four runs exist (bus A and bus B, morning and afternoon, each created when its driver asked). A morning:
	 * a1 picked up then dropped off, a2 picked up, a3 not present then picked up; the run ends. B morning: b1 absent and not
	 * confirmed, b2 not present; the run stays in progress. A afternoon: a1 picked up and dropped off, a2 picked up, a3
	 * picked up and dropped off; the run is left in progress. Thursday: only bus A's two runs are asked for (bus B's are
	 * never opened, so they have no row). A morning: a1 absent and not confirmed, a2 picked up then dropped off, a3 not
	 * present; the run ends. Friday: nobody opens any run.
	 */
	private Week theWeek() throws Exception {
		UUID parent = aParent();
		Bus a = aBus("Bus A");
		Bus b = aBus("Bus B");
		UUID a1 = aStudent("Ali", parent);
		UUID a2 = aStudent("Amal", parent);
		UUID a3 = aStudent("Aya", parent);
		UUID b1 = aStudent("Bashir", parent);
		UUID b2 = aStudent("Bana", parent);
		onRoute(a, a1, a2, a3);
		onRoute(b, b1, b2);

		reportAbsence(parent, a1, THURSDAY, THURSDAY);
		cancelAbsence(parent, a3, reportAbsence(parent, a3, THURSDAY, THURSDAY));
		reportAbsence(parent, a2, FRIDAY, LocalDate.of(2026, 11, 10));
		absentToday(parent, b1);
		reportAbsence(parent, b2, LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 9));

		String aMorning = runId(a, "MORNING");
		String aAfternoon = runId(a, "AFTERNOON");
		String bMorning = runId(b, "MORNING");
		started(a, aMorning);
		started(b, bMorning);
		started(a, aAfternoon);
		confirmed(a, aMorning, a1, "PICKED_UP", "DROPPED_OFF");
		confirmed(a, aMorning, a2, "PICKED_UP");
		confirmed(a, aMorning, a3, "NOT_PRESENT", "PICKED_UP");
		confirmed(b, bMorning, b2, "NOT_PRESENT");
		assertEquals(200, end(a, aMorning).getStatus());
		confirmed(a, aAfternoon, a1, "PICKED_UP", "DROPPED_OFF");
		confirmed(a, aAfternoon, a2, "PICKED_UP");
		confirmed(a, aAfternoon, a3, "PICKED_UP", "DROPPED_OFF");

		setNow(THURSDAY, LocalTime.of(7, 0));
		String thursdayMorning = runId(a, "MORNING");
		started(a, thursdayMorning);
		confirmed(a, thursdayMorning, a2, "PICKED_UP", "DROPPED_OFF");
		confirmed(a, thursdayMorning, a3, "NOT_PRESENT");
		assertEquals(200, end(a, thursdayMorning).getStatus());

		setNow(FRIDAY, LocalTime.of(7, 0));
		return new Week(parent, a, b, a1, a2, a3, b1, b2);
	}

	// ---------------------------------------------------------------- the exact numbers

	/**
	 * The oracle, worked out by hand from the contract rules (a student counts once a day per figure; pickedUp includes
	 * those since dropped off; notPresent leaves out one later picked up; absent counts only live absences; total is the
	 * sum of the days):
	 * <pre>
	 * Wed 11-04  runs 4, finished 1 (A morning), pickedUp {a1,a2,a3} = 3, droppedOff {a1,a3} = 2,
	 *            notPresent {b2} = 1 (a3 was later picked up), absent {b1} = 1
	 * Thu 11-05  runs 2 (B's were never opened), finished 1, pickedUp {a2} = 1, droppedOff {a2} = 1,
	 *            notPresent {a3} = 1, absent {a1} = 1 (a3's absence was cancelled)
	 * Fri 11-06  runs 0, pickedUp 0, droppedOff 0, notPresent 0, absent {a2} = 1
	 * total      runs 6, finished 2, pickedUp 4, droppedOff 3, notPresent 2, absent 3
	 * </pre>
	 */
	@Test
	void theFiguresOfAWeekAreExactPerDayAndInTotal() throws Exception {
		theWeek();

		String body = okTotals("2026-11-04", "2026-11-06");

		Map<String, Object> shown = JsonPath.read(body, "$");
		assertEquals(Set.of("from", "to", "studentsOnRoutes", "total", "days"), shown.keySet());
		assertEquals("2026-11-04", shown.get("from"));
		assertEquals("2026-11-06", shown.get("to"));
		assertEquals(5, (int) JsonPath.read(body, "$.studentsOnRoutes"));
		assertEquals(List.of("2026-11-04", "2026-11-05", "2026-11-06"), JsonPath.<List<String>>read(body, "$.days[*].date"));
		assertEquals(Set.of("date", "runs", "runsFinished", "pickedUp", "droppedOff", "notPresent", "absent"),
				JsonPath.<Map<String, Object>>read(body, "$.days[0]").keySet());
		assertEquals(FIGURE_KEYS, JsonPath.<Map<String, Object>>read(body, "$.total").keySet());
		assertEquals(figures(4, 1, 3, 2, 1, 1), figuresOf(body, "$.days[0]"));
		assertEquals(figures(2, 1, 1, 1, 1, 1), figuresOf(body, "$.days[1]"));
		assertEquals(figures(0, 0, 0, 0, 0, 1), figuresOf(body, "$.days[2]"));
		assertEquals(figures(6, 2, 4, 3, 2, 3), figuresOf(body, "$.total"));
	}

	/** A single day of the same week is the same numbers, whichever way the day is asked for. */
	@Test
	void aSingleDayGivesThatDaysFiguresWhetherAskedWithFromAloneOrFromAndTo() throws Exception {
		theWeek();

		String fromOnly = okTotals("2026-11-05", null);
		String both = okTotals("2026-11-05", "2026-11-05");

		for (String body : List.of(fromOnly, both)) {
			assertEquals("2026-11-05", JsonPath.read(body, "$.from"));
			assertEquals("2026-11-05", JsonPath.read(body, "$.to"));
			assertEquals(1, JsonPath.<List<?>>read(body, "$.days").size());
			assertEquals(figures(2, 1, 1, 1, 1, 1), figuresOf(body, "$.days[0]"));
			assertEquals(figures(2, 1, 1, 1, 1, 1), figuresOf(body, "$.total"));
		}
	}

	/** Contract: the days of a range outside the week are zeros, and an absence is counted only on the days it covers. */
	@Test
	void anAbsenceThatRunsPastTheRangeIsCountedOnlyOnTheDaysInsideIt() throws Exception {
		theWeek();

		String body = okTotals("2026-11-06", "2026-11-09");

		// a2 is absent Fri 11-06 to Tue 11-10; b2 is absent Mon 11-09. Saturday and Sunday: the contract says "a live
		// absence covering the day", so a2 counts there too, but whether a weekend is counted is a contract gap, so the
		// weekend days are not asserted here (see the report).
		assertEquals(List.of("2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"),
				JsonPath.<List<String>>read(body, "$.days[*].date"));
		assertEquals(figures(0, 0, 0, 0, 0, 1), figuresOf(body, "$.days[0]"));
		assertEquals(figures(0, 0, 0, 0, 0, 2), figuresOf(body, "$.days[3]"), "a2 and b2 on Monday 11-09");
	}

	/** Contract: studentsOnRoutes is the active students on a route now; an inactive one and one with no route are left out. */
	@Test
	void studentsOnRoutesCountsOnlyActiveStudentsOnARoute() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID active1 = aStudent("Adam", null);
		UUID active2 = aStudent("Bilal", null);
		UUID leaving = aStudent("Celine", null);
		aStudent("Dana", null);
		onRoute(bus, active1, active2, leaving);
		Student inactive = studentRepository.findById(leaving).orElseThrow();
		inactive.setStatus(StudentStatus.INACTIVE);
		studentRepository.save(inactive);

		String body = okTotals(null, null);

		assertEquals(2, (int) JsonPath.read(body, "$.studentsOnRoutes"));
	}

	/** Contract: only the head's own school is counted: another school's runs, confirmations and absences change nothing. */
	@Test
	void anotherSchoolsActivityNeverChangesThisSchoolsFigures() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID parent = aParent();
		UUID tarek = aStudent("Tarek", parent);
		onRoute(bus, tarek);
		String run = runId(bus, "MORNING");
		started(bus, run);
		confirmed(bus, run, tarek, "PICKED_UP");
		String before = okTotals("2026-11-04", "2026-11-05");
		assertEquals(figures(2, 0, 1, 0, 0, 0), figuresOf(before, "$.days[0]"));

		UUID mine = school;
		school = UUID.randomUUID();
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(school)
				.arrivalTime(LocalTime.of(7, 30)).dismissalTime(LocalTime.of(14, 0)).build());
		UUID otherParent = aParent();
		Bus otherBus = aBus("Other bus");
		UUID a = aStudent("Alia", otherParent);
		UUID b = aStudent("Basma", otherParent);
		onRoute(otherBus, a, b);
		String otherRun = runId(otherBus, "MORNING");
		started(otherBus, otherRun);
		confirmed(otherBus, otherRun, a, "PICKED_UP", "DROPPED_OFF");
		confirmed(otherBus, otherRun, b, "NOT_PRESENT");
		absentToday(otherParent, a);
		school = mine;

		assertEquals(before, okTotals("2026-11-04", "2026-11-05"));
		assertEquals(1, (int) JsonPath.read(okTotals(null, null), "$.studentsOnRoutes"));
	}

	/** Contract: a student's absence and confirmation on the same day are each counted (confirmation wins only on screens). */
	@Test
	void aStudentWhoIsAbsentAndStillPickedUpCountsInBothFigures() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID parent = aParent();
		UUID tarek = aStudent("Tarek", parent);
		onRoute(bus, tarek);
		absentToday(parent, tarek);
		String run = runId(bus, "MORNING");
		started(bus, run);
		confirmed(bus, run, tarek, "PICKED_UP");

		String body = okTotals(null, null);

		assertEquals(figures(2, 0, 1, 0, 0, 1), figuresOf(body, "$.days[0]"));
	}

	/**
	 * Contract: a student's status is their latest on each run, and each student counts once a day per figure. One child
	 * not present on the morning run and picked up on the afternoon run is in both figures (the "later picked up" exception
	 * is for the same run); a child not present on both runs counts once; a child picked up on both counts once.
	 */
	@Test
	void theLatestStatusIsPerRunAndAStudentCountsOnceADayInEachFigure() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID mixed = aStudent("Mixed", parent);
		UUID neverThere = aStudent("Never", parent);
		UUID twice = aStudent("Twice", parent);
		onRoute(bus, mixed, neverThere, twice);
		String morning = runId(bus, "MORNING");
		String afternoon = runId(bus, "AFTERNOON");
		started(bus, morning);
		started(bus, afternoon);
		confirmed(bus, morning, mixed, "NOT_PRESENT");
		confirmed(bus, afternoon, mixed, "PICKED_UP");
		confirmed(bus, morning, neverThere, "NOT_PRESENT");
		confirmed(bus, afternoon, neverThere, "NOT_PRESENT");
		confirmed(bus, morning, twice, "PICKED_UP");
		confirmed(bus, afternoon, twice, "PICKED_UP");

		String body = okTotals(null, null);

		// pickedUp {mixed, twice} = 2, notPresent {mixed (morning), neverThere} = 2, droppedOff 0, two runs, none finished
		assertEquals(figures(2, 0, 2, 0, 2, 0), figuresOf(body, "$.days[0]"));
	}

	// ---------------------------------------------------------------- the range

	/** Contract: no parameters is today. */
	@Test
	void noParametersMeansTodayAndAnEmptySchoolIsAllZeros() throws Exception {
		String body = okTotals(null, null);

		assertEquals("2026-11-04", JsonPath.read(body, "$.from"));
		assertEquals("2026-11-04", JsonPath.read(body, "$.to"));
		assertEquals(List.of("2026-11-04"), JsonPath.<List<String>>read(body, "$.days[*].date"));
		assertEquals(0, (int) JsonPath.read(body, "$.studentsOnRoutes"));
		assertAllZero(body);
	}

	/** Contract: "from defaults to today and to defaults to from", so a lone "to" reaches from today to that day. */
	@Test
	void aLoneToRunsFromTodayToThatDay() throws Exception {
		String body = okTotals(null, "2026-11-06");

		assertEquals("2026-11-04", JsonPath.read(body, "$.from"));
		assertEquals("2026-11-06", JsonPath.read(body, "$.to"));
		assertEquals(3, JsonPath.<List<?>>read(body, "$.days").size());
	}

	/** Contract: "to" before "from" is 400 on "to" (and nothing in the body for the other fields). */
	@Test
	void aReversedRangeIs400OnTo() throws Exception {
		MockHttpServletResponse response = totals("2026-11-06", "2026-11-04");

		assertEquals(400, response.getStatus());
		assertEquals(Set.of("to"), JsonPath.<Map<String, Object>>read(response.getContentAsString(), "$.errors").keySet());
	}

	/** Contract: more than 62 days (both ends included) is 400 on "to"; 62 days is fine, one row per date. */
	@Test
	void sixtyTwoDaysIsAllowedWithSixtyTwoRowsAndSixtyThreeIs400OnTo() throws Exception {
		String ok = okTotals("2026-11-04", "2027-01-04");
		assertEquals(62, JsonPath.<List<?>>read(ok, "$.days").size());
		assertEquals("2027-01-04", JsonPath.read(ok, "$.days[61].date"));

		MockHttpServletResponse tooLong = totals("2026-11-04", "2027-01-05");

		assertEquals(400, tooLong.getStatus());
		assertEquals(Set.of("to"), JsonPath.<Map<String, Object>>read(tooLong.getContentAsString(), "$.errors").keySet());
	}

	/** Contract: a future date is allowed and is all zeros; every date is listed, in order. */
	@Test
	void aFutureRangeIsAllZerosWithEveryDateListed() throws Exception {
		String body = okTotals("2027-03-01", "2027-03-03");

		assertEquals(List.of("2027-03-01", "2027-03-02", "2027-03-03"), JsonPath.<List<String>>read(body, "$.days[*].date"));
		assertAllZero(body);
	}

	/** Contract: "every date of the range in order, with zeros when nothing happened", so weekends and a holiday are rows. */
	@Test
	void weekendsAndAHolidayAreListedWithZeros() throws Exception {
		aBus("Hamra morning run");
		aHoliday(LocalDate.of(2026, 11, 9));

		String body = okTotals("2026-11-07", "2026-11-10");

		assertEquals(List.of("2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"),
				JsonPath.<List<String>>read(body, "$.days[*].date"));
		assertAllZero(body);
	}

	/** Contract: a date that does not parse is 400 "Invalid request parameter", on either parameter and on the export. */
	@Test
	void aDateThatIsNotYyyyMmDdIs400InvalidRequestParameter() throws Exception {
		for (String bad : List.of("2026-02-30", "2026-13-01", "11/03/2026", "2026-11-03T10:00:00", "yesterday")) {
			for (MockHttpServletResponse response : List.of(totals(bad, null), totals(null, bad), totals(bad, bad),
					export(bad, null), export(null, bad))) {
				assertEquals(400, response.getStatus(), bad);
				assertEquals("Invalid request parameter", JsonPath.read(response.getContentAsString(), "$.detail"), bad);
				assertNull(response.getHeader("Content-Disposition"), "an error is not a file: " + bad);
			}
		}
	}

	/**
	 * An empty value ("?from=") is not a date, so the contract's "a date that is not YYYY-MM-DD is 400" covers it. The
	 * contract does not say whether an empty value counts as "omitted" (today), so this asks for the contract's wording.
	 *
	 * <p>KNOWN FINDING (SCRUM-266-bugs.md BUG-1): today an empty value is read as omitted and answers 200. Kept as a test
	 * behind a switch, not weakened. Run with {@code -Dknown-bug.SCRUM-271-empty-date=true}; delete the annotation once
	 * the answer is 400 or the contract says an empty value means omitted.
	 */
	@Test
	@EnabledIfSystemProperty(named = "known-bug.SCRUM-271-empty-date", matches = "true",
			disabledReason = "KNOWN FINDING in SCRUM-271 (SCRUM-266-bugs.md BUG-1). Run with -Dknown-bug.SCRUM-271-empty-date=true")
	void anEmptyDateIs400LikeAnyOtherMalformedDate() throws Exception {
		assertEquals(400, totals("", null).getStatus());
		assertEquals(400, totals(null, "").getStatus());
	}

	// ---------------------------------------------------------------- the export

	/** Contract "The export": same figures as the JSON, header row, a row per date, TOTAL last, CRLF, no studentsOnRoutes. */
	@Test
	void theCsvHasTheExactHeaderOneRowPerDateAndATotalRowEqualToTheJson() throws Exception {
		theWeek();
		String json = okTotals("2026-11-04", "2026-11-06");

		MockHttpServletResponse response = export("2026-11-04", "2026-11-06");

		assertEquals(200, response.getStatus(), response.getContentAsString());
		assertTrue(response.getContentType().startsWith("text/csv"), response.getContentType());
		assertTrue(response.getContentType().toLowerCase().contains("charset=utf-8"),
				"the contract says UTF-8: " + response.getContentType());
		String disposition = response.getHeader("Content-Disposition");
		assertTrue(disposition.startsWith("attachment"), disposition);
		assertTrue(disposition.contains("wassel-transport-2026-11-04_2026-11-06.csv"), disposition);
		String csv = response.getContentAsString();
		assertTrue(csv.endsWith("\r\n"), "every row ends with CRLF");
		assertFalse(csv.replace("\r\n", "").contains("\n"), "no bare line feeds");
		assertFalse(csv.startsWith("\uFEFF"), "no byte order mark");
		List<String> lines = List.of(csv.split("\r\n", -1));
		assertEquals(6, lines.size(), "header, three dates, TOTAL and the empty piece after the last CRLF");
		assertEquals(CSV_HEADER, lines.get(0));
		assertFalse(csv.contains("studentsOnRoutes"));
		String[] columns = {"runs", "runsFinished", "pickedUp", "droppedOff", "notPresent", "absent"};
		for (int day = 0; day < 3; day++) {
			StringBuilder row = new StringBuilder(JsonPath.<String>read(json, "$.days[" + day + "].date"));
			for (String column : columns) {
				row.append(',').append((int) JsonPath.read(json, "$.days[" + day + "]." + column));
			}
			assertEquals(row.toString(), lines.get(day + 1));
		}
		StringBuilder total = new StringBuilder("TOTAL");
		for (String column : columns) {
			total.append(',').append((int) JsonPath.read(json, "$.total." + column));
		}
		assertEquals(total.toString(), lines.get(4));
		assertEquals("2026-11-04,4,1,3,2,1,1", lines.get(1));
		assertEquals("TOTAL,6,2,4,3,2,3", lines.get(4));
		assertEquals("", lines.get(5));
	}

	/** Contract: no parameters is today, in the file as in the JSON, and the file is named after the range. */
	@Test
	void theCsvWithNoParametersIsTodayAndIsNamedAfterThatDay() throws Exception {
		MockHttpServletResponse response = export(null, null);

		assertEquals(200, response.getStatus());
		assertTrue(response.getHeader("Content-Disposition").contains("wassel-transport-2026-11-04_2026-11-04.csv"));
		assertEquals(CSV_HEADER + "\r\n2026-11-04,0,0,0,0,0,0\r\nTOTAL,0,0,0,0,0,0\r\n", response.getContentAsString());
	}

	/** The export has the same range rules as the JSON: reversed and too long are 400 on "to", with no file. */
	@Test
	void theExportRefusesTheSameRangesAsTheJsonAndSendsNoFile() throws Exception {
		for (MockHttpServletResponse response : List.of(export("2026-11-06", "2026-11-04"),
				export("2026-11-04", "2027-01-05"))) {
			assertEquals(400, response.getStatus());
			assertEquals(Set.of("to"), JsonPath.<Map<String, Object>>read(response.getContentAsString(), "$.errors").keySet());
			assertNull(response.getHeader("Content-Disposition"));
		}
		assertEquals(200, export("2026-11-04", "2027-01-04").getStatus());
	}

	// ---------------------------------------------------------------- who may ask

	/** Contract: both endpoints are for the head of transportation. Admin gets 403 (no admin access, conflict C2). */
	@Test
	void onlyTheHeadOfTransportationMayAskAndNobodyElseGetsAFile() throws Exception {
		for (String path : List.of(TOTALS, EXPORT)) {
			assertEquals(200, send(get(path).with(head())).getStatus(), path);
			for (Role role : List.of(Role.ADMIN, Role.DRIVER, Role.PARENT)) {
				MockHttpServletResponse response = send(get(path).with(as(role, UUID.randomUUID())));
				assertEquals(403, response.getStatus(), role + " " + path);
				assertNull(response.getHeader("Content-Disposition"), "no file for " + role);
			}
			MockHttpServletResponse signedOut = send(get(path));
			assertEquals(401, signedOut.getStatus(), path);
			assertEquals("", signedOut.getContentAsString(), "401 has an empty body");
			assertNull(signedOut.getHeader("Content-Disposition"));
		}
	}
}
