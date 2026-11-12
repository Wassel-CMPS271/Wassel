package com.wassel.backend.attendance.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.attendance.dto.AttendanceDirection;
import com.wassel.backend.attendance.dto.AttendanceStatus;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.runs.dto.AttendanceRecord;
import com.wassel.backend.runs.entity.Confirmation;
import com.wassel.backend.runs.entity.ConfirmationStatus;
import com.wassel.backend.runs.entity.Run;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunState;
import com.wassel.backend.runs.repository.ConfirmationRepository;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.runs.repository.RunRepository;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;

/**
 * SCRUM-265: the attendance history and pickup/drop-off audit (docs/contracts/attendance.md). Real app and PostgreSQL:
 * the driver's own endpoints record the taps where the day matters, and the repositories seed what only volume, ties,
 * odd times or another school need. Every test has its own school.
 */
class AttendanceHistoryTests extends RunCriteriaSupport {

	private static final String HEAD = "/api/head-of-transport/attendance";

	private static final String AUDIT = HEAD + "/audit";

	private static final LocalDate MONDAY = LocalDate.of(2026, 11, 2);

	private static final LocalDate TUESDAY = LocalDate.of(2026, 11, 3);

	private static final String RANGE = "from=2026-11-02&to=2026-11-04";

	private static final String MONDAY_ONLY = "from=2026-11-02&to=2026-11-02";

	private static final Instant MONDAY_5AM = Instant.parse("2026-11-02T05:00:00Z");

	@Autowired
	private RunRepository runRepository;

	@Autowired
	private ConfirmationRepository confirmationRepository;

	@Autowired
	private RouteRepository routeRepository;

	private UUID parent;

	private UUID child;

	@BeforeEach
	void aParentWithAChild() {
		parent = aParent();
		child = aStudent("Tarek", parent);
	}

	// ---------------------------------------------------------------- helpers

	private MockHttpServletResponse fetch(String path, String query, RequestPostProcessor caller) throws Exception {
		return send(get(query == null ? path : path + "?" + query).with(caller));
	}

	private MockHttpServletResponse headGet(String path, String query) throws Exception {
		return fetch(path, query, head());
	}

	private RequestPostProcessor parentOf() {
		return as(Role.PARENT, parent);
	}

	private MockHttpServletResponse childHistory(UUID childId, String query) throws Exception {
		return fetch("/api/parent/children/" + childId + "/attendance", query, parentOf());
	}

	private String ok(MockHttpServletResponse response) throws Exception {
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	/** The driver starts the run (a repeat is fine) and gives the student a status, at this moment in Beirut. Returns the run's id. */
	private UUID tap(Bus bus, LocalDate day, String direction, LocalTime time, UUID student, String status)
			throws Exception {
		setNow(day, time);
		String run = runId(bus, direction);
		assertEquals(200, start(bus, run).getStatus());
		assertEquals(200, confirm(bus, run, student, status).getStatus());
		return UUID.fromString(run);
	}

	private int total(String json) {
		return JsonPath.read(json, "$.total");
	}

	private UUID seedRun(String routeId, LocalDate date, RunDirection direction) {
		return runRepository.save(Run.builder().schoolId(school).routeId(UUID.fromString(routeId)).runDate(date)
				.direction(direction).state(RunState.FINISHED).build()).getId();
	}

	private Confirmation seedTap(UUID run, UUID student, ConfirmationStatus status, Instant at) {
		return confirmationRepository.save(Confirmation.builder().schoolId(school).runId(run).studentId(student)
				.status(status).confirmedAt(at).build());
	}

	private UUID studentIn(UUID otherSchool, String firstName, UUID parentId) {
		return studentRepository.save(Student.builder().schoolId(otherSchool).firstName(firstName).lastName("Other")
				.grade("4").guardianName("G").guardianPhone("+961 3 999 999").status(StudentStatus.ACTIVE)
				.parentUserId(parentId).build()).getId();
	}

	private Instant storedAt(UUID run, UUID student, ConfirmationStatus status) {
		return confirmationRepository.findBySchoolIdAndRunIdAndStudentId(school, run, student).stream()
				.filter(c -> c.getStatus() == status).findFirst().orElseThrow().getConfirmedAt();
	}

	private static List<String> strings(String json, String path) {
		return JsonPath.read(json, path);
	}

	// ---------------------------------------------------------------- the range, paging and missing parameters

	/** The three endpoints, each with the signed-in caller it needs. */
	private enum Kind {
		PARENT, HEAD, AUDIT
	}

	private RequestPostProcessor callerFor(Kind kind) {
		return kind == Kind.PARENT ? parentOf() : head();
	}

	private String pathFor(Kind kind) {
		return switch (kind) {
			case PARENT -> "/api/parent/children/" + child + "/attendance";
			case AUDIT -> AUDIT;
			case HEAD -> HEAD;
		};
	}

	@ParameterizedTest
	@EnumSource(Kind.class)
	void fromAndToAreRequired(Kind kind) throws Exception {
		MockHttpServletResponse noFrom = fetch(pathFor(kind), "to=2026-11-04", callerFor(kind));
		assertEquals(400, noFrom.getStatus());
		assertEquals("Validation failed", JsonPath.read(noFrom.getContentAsString(), "$.detail"));
		assertEquals("from is required", JsonPath.read(noFrom.getContentAsString(), "$.errors.from"));

		MockHttpServletResponse noTo = fetch(pathFor(kind), "from=2026-11-02", callerFor(kind));
		assertEquals(400, noTo.getStatus());
		assertEquals("to is required", JsonPath.read(noTo.getContentAsString(), "$.errors.to"));
		assertEquals(400, fetch(pathFor(kind), "from=2026-11-02&to=", callerFor(kind)).getStatus());
	}

	@ParameterizedTest
	@EnumSource(Kind.class)
	void toBeforeFromAndTooLongRangesAreRejected(Kind kind) throws Exception {
		MockHttpServletResponse backwards = fetch(pathFor(kind), "from=2026-11-04&to=2026-11-03", callerFor(kind));
		assertEquals(400, backwards.getStatus());
		assertEquals("To must not be before from", JsonPath.read(backwards.getContentAsString(), "$.errors.to"));

		// 2026-09-01 to 2026-11-01 is 62 days counting both ends; one more day is 63.
		assertEquals(200, fetch(pathFor(kind), "from=2026-09-01&to=2026-11-01", callerFor(kind)).getStatus());
		MockHttpServletResponse tooLong = fetch(pathFor(kind), "from=2026-09-01&to=2026-11-02", callerFor(kind));
		assertEquals(400, tooLong.getStatus());
		assertEquals("The range may cover at most 62 days", JsonPath.read(tooLong.getContentAsString(), "$.errors.to"));
	}

	@ParameterizedTest
	@EnumSource(Kind.class)
	void malformedDatesAre400NeverAServerError(Kind kind) throws Exception {
		for (String query : List.of("from=2026-13-01&to=2026-11-04", "from=abc&to=2026-11-04")) {
			MockHttpServletResponse response = fetch(pathFor(kind), query, callerFor(kind));
			assertEquals(400, response.getStatus(), query);
			assertEquals("Invalid request parameter", JsonPath.read(response.getContentAsString(), "$.detail"), query);
		}
	}

	@ParameterizedTest
	@EnumSource(Kind.class)
	void aFutureRangeIsAnEmptySuccess(Kind kind) throws Exception {
		String body = ok(fetch(pathFor(kind), "from=2027-01-01&to=2027-01-31", callerFor(kind)));
		assertEquals(0, (int) JsonPath.read(body, kind == Kind.PARENT ? "$.length()" : "$.items.length()"));
	}

	@ParameterizedTest
	@EnumSource(value = Kind.class, names = { "HEAD", "AUDIT" })
	void pagingParametersAreChecked(Kind kind) throws Exception {
		String path = pathFor(kind);
		MockHttpServletResponse negative = headGet(path, RANGE + "&page=-1");
		assertEquals(400, negative.getStatus());
		assertEquals("Page must not be negative", JsonPath.read(negative.getContentAsString(), "$.errors.page"));
		for (String size : List.of("0", "201")) {
			MockHttpServletResponse bad = headGet(path, RANGE + "&size=" + size);
			assertEquals(400, bad.getStatus(), size);
			assertEquals("Size must be between 1 and 200", JsonPath.read(bad.getContentAsString(), "$.errors.size"));
		}
		assertEquals(200, headGet(path, RANGE + "&size=200").getStatus());
		assertEquals(400, headGet(path, RANGE + "&page=x").getStatus());
		String defaults = ok(headGet(path, RANGE));
		assertEquals(0, (int) JsonPath.read(defaults, "$.page"));
		assertEquals(50, (int) JsonPath.read(defaults, "$.size"));
		assertEquals("2026-11-02", JsonPath.read(defaults, "$.from"));
		assertEquals("2026-11-04", JsonPath.read(defaults, "$.to"));
	}

	@Test
	void aBadRangeIs400BeforeTheChildIsLookedAt() throws Exception {
		UUID foreign = aStudent("Stranger", aParent());
		assertEquals(400, childHistory(foreign, "from=2026-11-04&to=2026-11-03").getStatus());
		assertEquals(404, childHistory(foreign, RANGE).getStatus());
	}

	// ---------------------------------------------------------------- what the driver recorded

	@Test
	void aCorrectedChildShowsTheLatestStatusAndEveryStoredTime() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, child);
		UUID run = tap(bus, MONDAY, "MORNING", LocalTime.of(7, 0), child, "NOT_PRESENT");
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 10), child, "PICKED_UP");
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 20), child, "PICKED_UP"); // a retry keeps the first time
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 40), child, "DROPPED_OFF");

		String body = ok(headGet(HEAD, MONDAY_ONLY));

		assertEquals(1, (int) JsonPath.read(body, "$.total"));
		assertEquals("DROPPED_OFF", JsonPath.read(body, "$.items[0].status"));
		assertEquals(storedAt(run, child, ConfirmationStatus.NOT_PRESENT),
				Instant.parse(JsonPath.read(body, "$.items[0].notPresentAt")));
		assertEquals(storedAt(run, child, ConfirmationStatus.PICKED_UP),
				Instant.parse(JsonPath.read(body, "$.items[0].pickedUpAt")));
		assertEquals(Instant.parse("2026-11-02T05:10:00Z"), Instant.parse(JsonPath.read(body, "$.items[0].pickedUpAt")));
		assertEquals(storedAt(run, child, ConfirmationStatus.DROPPED_OFF),
				Instant.parse(JsonPath.read(body, "$.items[0].droppedOffAt")));
		assertEquals(run.toString(), JsonPath.read(body, "$.items[0].runId"));
		assertEquals("Hamra morning run", JsonPath.read(body, "$.items[0].route.name"));
		assertEquals(bus.routeId(), JsonPath.read(body, "$.items[0].route.id"));
		assertEquals(child.toString(), JsonPath.read(body, "$.items[0].student.id"));
		assertEquals("Tarek", JsonPath.read(body, "$.items[0].student.firstName"));
		assertTrue(((String) JsonPath.read(body, "$.items[0].droppedOffAt")).endsWith("Z"));
	}

	@Test
	void aNotPresentOnlyChildHasNullTimesForTheOthers() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, child);
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 0), child, "NOT_PRESENT");

		String body = ok(childHistory(child, MONDAY_ONLY));

		assertEquals("NOT_PRESENT", JsonPath.read(body, "$[0].status"));
		assertEquals("2026-11-02T05:00:00Z", JsonPath.read(body, "$[0].notPresentAt"));
		assertNull(JsonPath.read(body, "$[0].pickedUpAt"));
		assertNull(JsonPath.read(body, "$[0].droppedOffAt"));
	}

	@Test
	void theHighestStatusWinsEvenWhenTheTimesTie() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID run = seedRun(bus.routeId(), MONDAY, RunDirection.MORNING);
		Instant same = MONDAY_5AM;
		seedTap(run, child, ConfirmationStatus.NOT_PRESENT, same);
		seedTap(run, child, ConfirmationStatus.PICKED_UP, same);

		String body = ok(headGet(HEAD, MONDAY_ONLY));

		assertEquals("PICKED_UP", JsonPath.read(body, "$.items[0].status"));
	}

	@Test
	void aTapIsFiledUnderTheRunsDateNotTheMomentItWasRecorded() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID run = seedRun(bus.routeId(), MONDAY, RunDirection.AFTERNOON);
		// 00:30 in Beirut on Tuesday, for Monday's afternoon run.
		seedTap(run, child, ConfirmationStatus.PICKED_UP, Instant.parse("2026-11-02T22:30:00Z"));

		assertEquals(1, (int) JsonPath.read(ok(headGet(HEAD, MONDAY_ONLY)), "$.total"));
		assertEquals(0, (int) JsonPath.read(ok(headGet(HEAD, "from=2026-11-03&to=2026-11-03")), "$.total"));
		assertEquals(1, (int) JsonPath.read(ok(headGet(AUDIT, MONDAY_ONLY)), "$.total"));
	}

	@Test
	void rowsComeNewestDateFirstAfternoonBeforeMorningThenRouteThenStudent() throws Exception {
		Bus a = aBus("Route A");
		Bus b = aBus("Route B");
		UUID studentA = aStudent("Amal", null);
		UUID studentB = aStudent("Bilal", null);
		for (LocalDate day : List.of(MONDAY, TUESDAY)) {
			for (RunDirection direction : RunDirection.values()) {
				seedTap(seedRun(a.routeId(), day, direction), studentA, ConfirmationStatus.PICKED_UP,
						MONDAY_5AM);
				seedTap(seedRun(b.routeId(), day, direction), studentB, ConfirmationStatus.PICKED_UP,
						MONDAY_5AM);
			}
		}
		String lowRoute = a.routeId().compareTo(b.routeId()) < 0 ? a.routeId() : b.routeId();
		String highRoute = lowRoute.equals(a.routeId()) ? b.routeId() : a.routeId();

		String body = ok(headGet(HEAD, RANGE));

		List<String> got = new ArrayList<>();
		for (int i = 0; i < 8; i++) {
			got.add(JsonPath.read(body, "$.items[" + i + "].date") + " " + JsonPath.read(body, "$.items[" + i
					+ "].direction") + " " + JsonPath.read(body, "$.items[" + i + "].route.id"));
		}
		List<String> expected = new ArrayList<>();
		for (String day : List.of("2026-11-03", "2026-11-02")) {
			for (String direction : List.of("AFTERNOON", "MORNING")) {
				expected.add(day + " " + direction + " " + lowRoute);
				expected.add(day + " " + direction + " " + highRoute);
			}
		}
		assertEquals(expected, got);
		assertEquals(8, (int) JsonPath.read(body, "$.total"));
	}

	// ---------------------------------------------------------------- names, deleted routes, empty versus failed

	@Test
	void aDeletedRoutesRunsStayWithTheRouteIdAndNoName() throws Exception {
		Bus bus = aBus("Doomed route");
		onRoute(bus, child);
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 0), child, "PICKED_UP");
		assertEquals(200, end(bus, runId(bus, "MORNING")).getStatus());
		assertEquals(204, send(delete(ROUTES + "/" + bus.routeId()).with(head())).getStatus());

		String rows = ok(headGet(HEAD, RANGE));
		String audit = ok(headGet(AUDIT, RANGE));

		assertEquals(1, (int) JsonPath.read(rows, "$.total"));
		assertEquals(bus.routeId(), JsonPath.read(rows, "$.items[0].route.id"));
		assertNull(JsonPath.read(rows, "$.items[0].route.name"));
		assertEquals(bus.routeId(), JsonPath.read(audit, "$.items[0].route.id"));
		assertNull(JsonPath.read(audit, "$.items[0].route.name"));
		assertEquals(404, headGet(HEAD, RANGE + "&routeId=" + bus.routeId()).getStatus());
	}

	@Test
	void nothingRecordedIsAnEmptySuccessAndAPagePastTheEndKeepsTheTotal() throws Exception {
		String empty = ok(headGet(HEAD, RANGE));
		assertEquals(0, (int) JsonPath.read(empty, "$.total"));
		assertEquals(0, (int) JsonPath.read(empty, "$.items.length()"));
		assertEquals("[]", ok(childHistory(child, RANGE)));

		Bus bus = aBus("Hamra morning run");
		UUID run = seedRun(bus.routeId(), MONDAY, RunDirection.MORNING);
		seedTap(run, child, ConfirmationStatus.PICKED_UP, MONDAY_5AM);
		String past = ok(headGet(HEAD, RANGE + "&page=5&size=10"));
		assertEquals(1, (int) JsonPath.read(past, "$.total"));
		assertEquals(0, (int) JsonPath.read(past, "$.items.length()"));
	}

	@Test
	void aConfirmationForAnUnknownStudentIsAServerErrorNotASkippedRow() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID run = seedRun(bus.routeId(), MONDAY, RunDirection.MORNING);
		seedTap(run, child, ConfirmationStatus.PICKED_UP, MONDAY_5AM);
		seedTap(run, UUID.randomUUID(), ConfirmationStatus.PICKED_UP, Instant.parse("2026-11-02T05:01:00Z"));

		for (String path : List.of(HEAD, AUDIT)) {
			MockHttpServletResponse response = headGet(path, RANGE);
			assertEquals(500, response.getStatus());
			assertEquals("An unexpected error occurred", JsonPath.read(response.getContentAsString(), "$.detail"));
			assertFalse(response.getContentAsString().contains("unknown student"), response.getContentAsString());
		}
	}

	// ---------------------------------------------------------------- filters, paging, the audit

	@Test
	void filtersNarrowTheRowsAndForeignOrUnknownIdsAre404() throws Exception {
		Bus a = aBus("Route A");
		Bus b = aBus("Route B");
		UUID other = aStudent("Other", null);
		Instant at = MONDAY_5AM;
		seedTap(seedRun(a.routeId(), MONDAY, RunDirection.MORNING), child, ConfirmationStatus.PICKED_UP, at);
		seedTap(seedRun(b.routeId(), MONDAY, RunDirection.MORNING), other, ConfirmationStatus.PICKED_UP, at);
		UUID foreignSchool = UUID.randomUUID();
		UUID foreignStudent = studentIn(foreignSchool, "Foreign", null);

		assertEquals(2, (int) JsonPath.read(ok(headGet(HEAD, RANGE)), "$.total"));
		String byStudent = ok(headGet(HEAD, RANGE + "&studentId=" + child));
		assertEquals(1, (int) JsonPath.read(byStudent, "$.total"));
		assertEquals(child.toString(), JsonPath.read(byStudent, "$.items[0].student.id"));
		String byRoute = ok(headGet(HEAD, RANGE + "&routeId=" + b.routeId()));
		assertEquals(other.toString(), JsonPath.read(byRoute, "$.items[0].student.id"));
		assertEquals(1, (int) JsonPath.read(byRoute, "$.total"));
		assertEquals(0, (int) JsonPath.read(
				ok(headGet(HEAD, RANGE + "&studentId=" + child + "&routeId=" + b.routeId())), "$.total"));
		assertEquals(1, (int) JsonPath.read(ok(headGet(AUDIT, RANGE + "&studentId=" + child)), "$.total"));

		String unknownStudent = headGet(HEAD, RANGE + "&studentId=" + UUID.randomUUID()).getContentAsString();
		MockHttpServletResponse foreign = headGet(HEAD, RANGE + "&studentId=" + foreignStudent);
		assertEquals(404, foreign.getStatus());
		assertEquals(JsonPath.<String>read(unknownStudent, "$.detail"),
				JsonPath.<String>read(foreign.getContentAsString(), "$.detail"));
		assertEquals(404, headGet(HEAD, RANGE + "&routeId=" + UUID.randomUUID()).getStatus());
		assertEquals(404, headGet(AUDIT, RANGE + "&studentId=" + foreignStudent).getStatus());
		assertEquals(404, headGet(AUDIT, RANGE + "&routeId=" + UUID.randomUUID()).getStatus());
	}

	@Test
	void pagesAreDisjointCompleteAndInTheUnpagedOrder() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID run = seedRun(bus.routeId(), MONDAY, RunDirection.MORNING);
		List<String> ids = new ArrayList<>();
		for (int i = 0; i < 5; i++) {
			UUID student = aStudent("Kid" + i, null);
			ids.add(student.toString());
			seedTap(run, student, ConfirmationStatus.PICKED_UP, MONDAY_5AM);
		}
		List<String> expected = new TreeSet<>(ids).stream().toList(); // student id ascending

		List<String> paged = new ArrayList<>();
		for (int page = 0; page < 3; page++) {
			String body = ok(headGet(HEAD, RANGE + "&size=2&page=" + page));
			assertEquals(5, (int) JsonPath.read(body, "$.total"));
			assertEquals(page, (int) JsonPath.read(body, "$.page"));
			assertEquals(2, (int) JsonPath.read(body, "$.size"));
			paged.addAll(strings(body, "$.items[*].student.id"));
		}

		assertEquals(expected, paged);
		assertEquals(expected, strings(ok(headGet(HEAD, RANGE)), "$.items[*].student.id"));
	}

	@Test
	void theAuditHasOneEntryPerStoredTapNewestFirstWithAStableOrderForTies() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, child);
		UUID run = tap(bus, MONDAY, "MORNING", LocalTime.of(7, 0), child, "NOT_PRESENT");
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 10), child, "PICKED_UP");
		UUID tied = aStudent("Tied", null);
		Instant same = Instant.parse("2026-11-02T06:00:00Z");
		Confirmation notPresent = seedTap(run, tied, ConfirmationStatus.NOT_PRESENT, same);
		Confirmation pickedUp = seedTap(run, tied, ConfirmationStatus.PICKED_UP, same);

		String body = ok(headGet(AUDIT, MONDAY_ONLY));

		assertEquals(4, (int) JsonPath.read(body, "$.total"));
		assertEquals(List.of(pickedUp.getId().toString(), notPresent.getId().toString()),
				strings(body, "$.items[0:2].id"));
		assertEquals(List.of("PICKED_UP", "NOT_PRESENT"), strings(body, "$.items[2:4].status"));
		assertEquals(storedAt(run, child, ConfirmationStatus.PICKED_UP).toString(),
				JsonPath.read(body, "$.items[2].at"));
		assertEquals(run.toString(), JsonPath.read(body, "$.items[2].runId"));
		assertEquals("MORNING", JsonPath.read(body, "$.items[2].direction"));
		assertEquals("2026-11-02", JsonPath.read(body, "$.items[2].date"));
		assertEquals(child.toString(), JsonPath.read(body, "$.items[2].student.id"));

		List<String> paged = new ArrayList<>();
		for (int page = 0; page < 4; page++) {
			paged.addAll(strings(ok(headGet(AUDIT, "from=2026-11-02&to=2026-11-02&size=1&page=" + page)),
					"$.items[*].id"));
		}
		assertEquals(strings(body, "$.items[*].id"), paged);
	}

	@Test
	void anotherSchoolsAttendanceIsNeverSeen() throws Exception {
		UUID otherSchool = UUID.randomUUID();
		Bus bus = aBus("Hamra morning run");
		UUID foreignStudent = studentIn(otherSchool, "Foreign", null);
		UUID foreignRun = runRepository.save(Run.builder().schoolId(otherSchool).routeId(UUID.fromString(bus.routeId()))
				.runDate(MONDAY).direction(RunDirection.MORNING).state(RunState.FINISHED).build()).getId();
		confirmationRepository.save(Confirmation.builder().schoolId(otherSchool).runId(foreignRun)
				.studentId(foreignStudent).status(ConfirmationStatus.PICKED_UP)
				.confirmedAt(MONDAY_5AM).build());

		assertEquals(0, (int) JsonPath.read(ok(headGet(HEAD, RANGE)), "$.total"));
		assertEquals(0, (int) JsonPath.read(ok(headGet(AUDIT, RANGE)), "$.total"));
	}

	// ---------------------------------------------------------------- the parent

	@Test
	void aParentSeesOnlyTheAskedChildrenInTheirOwnRunsNewestFirst() throws Exception {
		UUID sibling = aStudent("Sibling", parent);
		UUID stranger = aStudent("Stranger", aParent());
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, child, sibling, stranger);
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 0), child, "PICKED_UP");
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 5), sibling, "PICKED_UP");
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 6), stranger, "PICKED_UP");
		tap(bus, TUESDAY, "MORNING", LocalTime.of(7, 0), child, "NOT_PRESENT");
		tap(bus, TUESDAY, "AFTERNOON", LocalTime.of(14, 0), child, "PICKED_UP");

		String body = ok(childHistory(child, RANGE));

		assertEquals(3, (int) JsonPath.read(body, "$.length()"));
		assertEquals(List.of("2026-11-03", "2026-11-03", "2026-11-02"), strings(body, "$[*].date"));
		assertEquals(List.of("AFTERNOON", "MORNING", "MORNING"), strings(body, "$[*].direction"));
		assertEquals(List.of("PICKED_UP", "NOT_PRESENT", "PICKED_UP"), strings(body, "$[*].status"));
		assertEquals(1, (int) JsonPath.read(ok(childHistory(sibling, RANGE)), "$.length()"));
	}

	@Test
	void aParentGetsTheSameNotFoundForAnyChildThatIsNotTheirs() throws Exception {
		UUID otherParent = aParent();
		UUID theirs = aStudent("Theirs", otherParent);
		UUID foreignChild = studentIn(UUID.randomUUID(), "Foreign", parent);
		Bus bus = aBus("Hamra morning run");
		seedTap(seedRun(bus.routeId(), MONDAY, RunDirection.MORNING), theirs, ConfirmationStatus.PICKED_UP,
				MONDAY_5AM);

		for (UUID notMine : List.of(theirs, UUID.randomUUID(), foreignChild)) {
			MockHttpServletResponse response = childHistory(notMine, RANGE);
			assertEquals(404, response.getStatus());
			assertEquals("Child not found.", JsonPath.read(response.getContentAsString(), "$.detail"));
		}
	}

	@Test
	void aChildRelinkedToAnotherParentIsGoneForTheFormerAndFullyVisibleToTheNew() throws Exception {
		UUID newParent = aParent();
		Bus bus = aBus("Hamra morning run");
		seedTap(seedRun(bus.routeId(), MONDAY, RunDirection.MORNING), child, ConfirmationStatus.PICKED_UP,
				MONDAY_5AM);
		assertEquals(1, (int) JsonPath.read(ok(childHistory(child, RANGE)), "$.length()"));

		assertEquals(200, send(patch("/api/head-of-transport/students/" + child + "/parent").with(head())
				.contentType(MediaType.APPLICATION_JSON).content("{\"parentUserId\":\"" + newParent + "\"}")).getStatus());

		assertEquals(404, childHistory(child, RANGE).getStatus());
		MockHttpServletResponse asNew = fetch("/api/parent/children/" + child + "/attendance", RANGE,
				as(Role.PARENT, newParent));
		assertEquals(1, (int) JsonPath.read(ok(asNew), "$.length()"));
	}

	@Test
	void theParentsViewHasExactlyTheDocumentedKeysAndOtherRolesAreRefused() throws Exception {
		Bus bus = aBus("Hamra morning run");
		seedTap(seedRun(bus.routeId(), MONDAY, RunDirection.MORNING), child, ConfirmationStatus.PICKED_UP,
				MONDAY_5AM);

		String body = ok(childHistory(child, RANGE));

		Set<String> keys = JsonPath.<Map<String, Object>>read(body, "$[0]").keySet();
		assertEquals(Set.of("date", "direction", "status", "notPresentAt", "pickedUpAt", "droppedOffAt"), keys);
		String path = "/api/parent/children/" + child + "/attendance";
		assertEquals(401, send(get(path + "?" + RANGE)).getStatus());
		assertEquals(403, fetch(path, RANGE, head()).getStatus());
		assertEquals(403, fetch(path, RANGE, as(Role.DRIVER, UUID.randomUUID())).getStatus());
		assertEquals(403, fetch(HEAD, RANGE, parentOf()).getStatus());
		assertEquals(403, fetch(AUDIT, RANGE, as(Role.DRIVER, UUID.randomUUID())).getStatus());
	}

	// ---------------------------------------------------------------- the samples are the contract

	private static Set<String> shape(Object json, String prefix) {
		Set<String> paths = new TreeSet<>();
		if (json instanceof Map<?, ?> map) {
			map.forEach((key, value) -> {
				paths.add(prefix + "." + key);
				paths.addAll(shape(value, prefix + "." + key));
			});
		}
		else if (json instanceof List<?> list) {
			list.forEach(item -> paths.addAll(shape(item, prefix + "[]")));
		}
		return paths;
	}

	/** The sample file, found from the working directory up, so it does not matter whether tests start in backend/ or at the repo root. */
	private static String sample(String name) throws Exception {
		Path dir = Path.of("").toAbsolutePath();
		while (dir != null && !Files.isDirectory(dir.resolve("docs/contracts/samples/attendance"))) {
			dir = dir.getParent();
		}
		if (dir == null) {
			throw new IllegalStateException("docs/contracts/samples/attendance not found above the working directory");
		}
		return Files.readString(dir.resolve("docs/contracts/samples/attendance").resolve(name));
	}

	private static Set<String> shapeOf(String json) {
		return shape(JsonPath.parse(json).json(), "");
	}

	/** One tap on a route's morning run, so rows, audit and the parent's list all have something to show. */
	private void seedForSamples() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, child);
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 0), child, "NOT_PRESENT");
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 5), child, "PICKED_UP");
	}

	@Test
	void realResponsesHaveTheSamplesKeysAndStatusValues() throws Exception {
		seedForSamples();
		String rows = ok(headGet(HEAD, RANGE));
		String audit = ok(headGet(AUDIT, RANGE));
		String parentBody = ok(childHistory(child, RANGE));

		assertEquals(shapeOf(sample("hot-attendance.json")), shapeOf(rows));
		assertEquals(shapeOf(sample("hot-attendance-audit.json")), shapeOf(audit));
		assertEquals(shapeOf(sample("parent-attendance.json")), shapeOf(parentBody));
		assertEquals("[]", sample("parent-attendance-empty.json").strip());
		for (String status : strings(audit, "$.items[*].status")) {
			assertTrue(Set.of("NOT_PRESENT", "PICKED_UP", "DROPPED_OFF").contains(status), status);
		}
	}

	@Test
	void aDeletedRoutesRealResponseHasTheDeletedRouteSamplesKeysAndNullName() throws Exception {
		Bus bus = aBus("Doomed route");
		onRoute(bus, child);
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 0), child, "PICKED_UP");
		assertEquals(200, end(bus, runId(bus, "MORNING")).getStatus());
		assertEquals(204, send(delete(ROUTES + "/" + bus.routeId()).with(head())).getStatus());

		String real = ok(headGet(HEAD, RANGE));
		String sample = sample("hot-attendance-deleted-route.json");

		assertEquals(shapeOf(sample), shapeOf(real));
		assertNull(JsonPath.read(sample, "$.items[0].route.name"));
		assertNull(JsonPath.read(real, "$.items[0].route.name"));
	}

	@Test
	void aRejectedRangeHasTheSamplesBodyShape() throws Exception {
		String real = headGet(HEAD, "from=2026-09-01&to=2026-11-02").getContentAsString();
		String sample = sample("invalid-range.json");

		assertEquals(shapeOf(sample), shapeOf(real));
		assertEquals(JsonPath.<String>read(sample, "$.errors.to"), JsonPath.<String>read(real, "$.errors.to"));
		assertNotEquals(0, ((Map<?, ?>) JsonPath.read(real, "$.errors")).size());
	}

	// ---------------------------------------------------------------- review fixes (SCRUM-265 step 5)

	private Route foreignRoute() {
		return routeRepository.save(Route.builder().schoolId(UUID.randomUUID()).name("Foreign route")
				.vehicleId(UUID.randomUUID()).driverId(UUID.randomUUID()).build());
	}

	@Test
	void aRouteOfAnotherSchoolIsTheSame404AsAnUnknownRoute() throws Exception {
		UUID foreign = foreignRoute().getId();

		for (String path : List.of(HEAD, AUDIT)) {
			MockHttpServletResponse unknown = headGet(path, RANGE + "&routeId=" + UUID.randomUUID());
			MockHttpServletResponse other = headGet(path, RANGE + "&routeId=" + foreign);
			assertEquals(404, other.getStatus(), path);
			assertEquals("Route not found.", JsonPath.read(other.getContentAsString(), "$.detail"));
			assertEquals(JsonPath.<String>read(unknown.getContentAsString(), "$.detail"),
					JsonPath.<String>read(other.getContentAsString(), "$.detail"));
		}
	}

	@Test
	void theAuditFiltersByRouteAndByRouteAndStudentTogether() throws Exception {
		Bus a = aBus("Route A");
		Bus b = aBus("Route B");
		UUID other = aStudent("Other", null);
		seedTap(seedRun(a.routeId(), MONDAY, RunDirection.MORNING), child, ConfirmationStatus.PICKED_UP, MONDAY_5AM);
		seedTap(seedRun(b.routeId(), MONDAY, RunDirection.MORNING), child, ConfirmationStatus.PICKED_UP, MONDAY_5AM);
		seedTap(seedRun(b.routeId(), TUESDAY, RunDirection.MORNING), other, ConfirmationStatus.PICKED_UP, MONDAY_5AM);

		String byRoute = ok(headGet(AUDIT, RANGE + "&routeId=" + b.routeId()));
		assertEquals(2, total(byRoute));
		assertEquals(Set.of(b.routeId()), new TreeSet<>(strings(byRoute, "$.items[*].route.id")));
		String both = ok(headGet(AUDIT, RANGE + "&routeId=" + b.routeId() + "&studentId=" + child));
		assertEquals(1, total(both));
		assertEquals(child.toString(), JsonPath.read(both, "$.items[0].student.id"));
		assertEquals(0, total(ok(headGet(AUDIT, RANGE + "&routeId=" + a.routeId() + "&studentId=" + other))));
		assertEquals(3, total(ok(headGet(AUDIT, RANGE))));
	}

	@Test
	void aRowMustHaveTheRunAndTheConfirmationInTheSchoolEachOnItsOwn() throws Exception {
		UUID otherSchool = UUID.randomUUID();
		Bus bus = aBus("Hamra morning run");
		// Own run, confirmation tagged with the other school.
		UUID ownRun = seedRun(bus.routeId(), MONDAY, RunDirection.MORNING);
		confirmationRepository.save(Confirmation.builder().schoolId(otherSchool).runId(ownRun).studentId(child)
				.status(ConfirmationStatus.PICKED_UP).confirmedAt(MONDAY_5AM).build());
		// The other school's run, confirmation tagged with this school.
		UUID foreignRun = runRepository.save(Run.builder().schoolId(otherSchool)
				.routeId(UUID.fromString(bus.routeId())).runDate(TUESDAY).direction(RunDirection.MORNING)
				.state(RunState.FINISHED).build()).getId();
		seedTap(foreignRun, child, ConfirmationStatus.PICKED_UP, MONDAY_5AM);
		// Both in the other school, for the parent's own child.
		UUID bothForeign = runRepository.save(Run.builder().schoolId(otherSchool)
				.routeId(UUID.fromString(bus.routeId())).runDate(MONDAY).direction(RunDirection.AFTERNOON)
				.state(RunState.FINISHED).build()).getId();
		confirmationRepository.save(Confirmation.builder().schoolId(otherSchool).runId(bothForeign).studentId(child)
				.status(ConfirmationStatus.PICKED_UP).confirmedAt(MONDAY_5AM).build());

		assertEquals(0, total(ok(headGet(HEAD, RANGE))));
		assertEquals(0, total(ok(headGet(AUDIT, RANGE))));
		assertEquals("[]", ok(childHistory(child, RANGE)));
	}

	@ParameterizedTest
	@EnumSource(value = Kind.class, names = { "HEAD", "AUDIT" })
	void idsAndNumbersThatDoNotParseAre400(Kind kind) throws Exception {
		for (String query : List.of(RANGE + "&studentId=abc", RANGE + "&routeId=abc", "from=2026-11-02&to=abc",
				RANGE + "&size=abc", RANGE + "&page=1.5")) {
			MockHttpServletResponse response = headGet(pathFor(kind), query);
			assertEquals(400, response.getStatus(), query);
			assertEquals("Invalid request parameter", JsonPath.read(response.getContentAsString(), "$.detail"), query);
		}
		MockHttpServletResponse notAUuid = fetch("/api/parent/children/not-a-uuid/attendance", RANGE, parentOf());
		assertEquals(400, notAUuid.getStatus());
		assertEquals("Invalid request parameter", JsonPath.read(notAUuid.getContentAsString(), "$.detail"));
	}

	@ParameterizedTest
	@EnumSource(value = Kind.class, names = { "HEAD", "AUDIT" })
	void aHugePageIsAnEmptyPageWithTheRealTotalAndAnOverflowingOneIs400(Kind kind) throws Exception {
		Bus bus = aBus("Hamra morning run");
		seedTap(seedRun(bus.routeId(), MONDAY, RunDirection.MORNING), child, ConfirmationStatus.PICKED_UP, MONDAY_5AM);

		String huge = ok(headGet(pathFor(kind), RANGE + "&page=2147483647&size=200"));
		assertEquals(1, total(huge));
		assertEquals(0, (int) JsonPath.read(huge, "$.items.length()"));
		assertEquals(400, headGet(pathFor(kind), RANGE + "&page=2147483648").getStatus());
	}

	@ParameterizedTest
	@EnumSource(Kind.class)
	void aRepeatedParameterIs400NotSilentlyTheFirstValue(Kind kind) throws Exception {
		for (String repeated : List.of("from=2026-11-04&to=2026-11-04&from=2026-11-01",
				"from=2026-11-02&to=2026-11-04&to=2026-11-03")) {
			MockHttpServletResponse response = fetch(pathFor(kind), repeated, callerFor(kind));
			assertEquals(400, response.getStatus(), repeated);
			String field = repeated.endsWith("from=2026-11-01") ? "from" : "to";
			assertEquals(field + " must be given once",
					JsonPath.read(response.getContentAsString(), "$.errors." + field), repeated);
		}
		if (kind != Kind.PARENT) {
			assertEquals(400, headGet(pathFor(kind), RANGE + "&size=5&size=6").getStatus());
		}
	}

	@Test
	void auditEntriesTiedOnTimeAndStatusComeInDescendingIdOrder() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID run = seedRun(bus.routeId(), MONDAY, RunDirection.MORNING);
		List<String> ids = new ArrayList<>();
		for (int i = 0; i < 4; i++) {
			ids.add(seedTap(run, aStudent("Kid" + i, null), ConfirmationStatus.PICKED_UP, MONDAY_5AM).getId()
					.toString());
		}
		List<String> descending = new TreeSet<>(ids).descendingSet().stream().toList();

		assertEquals(descending, strings(ok(headGet(AUDIT, RANGE)), "$.items[*].id"));
		List<String> paged = new ArrayList<>();
		for (int page = 0; page < 4; page++) {
			paged.addAll(strings(ok(headGet(AUDIT, RANGE + "&size=1&page=" + page)), "$.items[*].id"));
		}
		assertEquals(descending, paged);
	}

	@ParameterizedTest
	@EnumSource(Kind.class)
	void bothEndsOfTheRangeAreInAndTheDaysBesideThemAreOut(Kind kind) throws Exception {
		Bus bus = aBus("Hamra morning run");
		for (LocalDate day : List.of(LocalDate.of(2026, 11, 1), MONDAY, LocalDate.of(2026, 11, 4),
				LocalDate.of(2026, 11, 5))) {
			seedTap(seedRun(bus.routeId(), day, RunDirection.MORNING), child, ConfirmationStatus.PICKED_UP,
					MONDAY_5AM);
		}

		String body = ok(fetch(pathFor(kind), RANGE, callerFor(kind)));

		List<String> dates = strings(body, kind == Kind.PARENT ? "$[*].date" : "$.items[*].date");
		// Audit entries tie on time here, so their dates are compared in sorted order.
		assertEquals(List.of("2026-11-04", "2026-11-02"),
				dates.stream().sorted(java.util.Comparator.reverseOrder()).toList());
	}

	@Test
	void reportedAbsencesAreNotPartOfTheHistory() throws Exception {
		absentToday(parent, child);

		assertEquals(0, total(ok(headGet(HEAD, RANGE))));
		assertEquals(0, total(ok(headGet(AUDIT, RANGE))));
		assertEquals("[]", ok(childHistory(child, RANGE)));
	}

	@Test
	void aParentSeesAllThreeStoredTimesOfAFullJourney() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, child);
		UUID run = tap(bus, MONDAY, "MORNING", LocalTime.of(7, 0), child, "NOT_PRESENT");
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 10), child, "PICKED_UP");
		tap(bus, MONDAY, "MORNING", LocalTime.of(7, 40), child, "DROPPED_OFF");

		String body = ok(childHistory(child, MONDAY_ONLY));

		assertEquals("DROPPED_OFF", JsonPath.read(body, "$[0].status"));
		assertEquals(storedAt(run, child, ConfirmationStatus.NOT_PRESENT),
				Instant.parse(JsonPath.read(body, "$[0].notPresentAt")));
		assertEquals(storedAt(run, child, ConfirmationStatus.PICKED_UP),
				Instant.parse(JsonPath.read(body, "$[0].pickedUpAt")));
		assertEquals(storedAt(run, child, ConfirmationStatus.DROPPED_OFF),
				Instant.parse(JsonPath.read(body, "$[0].droppedOffAt")));
	}

	@Test
	void theApisEnumsHaveTheSameNamesAsTheOnesRunsStores() {
		assertEquals(List.of(ConfirmationStatus.values()).stream().map(Enum::name).toList(),
				List.of(AttendanceStatus.values()).stream().map(Enum::name).toList());
		assertEquals(List.of(RunDirection.values()).stream().map(Enum::name).toList(),
				List.of(AttendanceDirection.values()).stream().map(Enum::name).toList());
		for (ConfirmationStatus status : ConfirmationStatus.values()) {
			assertEquals(status.name(), AttendanceStatus.of(status).name());
		}
	}

	@Test
	void aRecordWithNoStatusRecordedCannotBeBuiltAndItsStatusIsTheHighestRecorded() {
		UUID id = UUID.randomUUID();
		assertThrows(IllegalArgumentException.class,
				() -> new AttendanceRecord(id, id, MONDAY, RunDirection.MORNING, id, null, null, null));
		assertEquals(ConfirmationStatus.NOT_PRESENT,
				new AttendanceRecord(id, id, MONDAY, RunDirection.MORNING, id, MONDAY_5AM, null, null).status());
		assertEquals(ConfirmationStatus.DROPPED_OFF,
				new AttendanceRecord(id, id, MONDAY, RunDirection.MORNING, id, MONDAY_5AM, MONDAY_5AM, MONDAY_5AM)
						.status());
	}
}
