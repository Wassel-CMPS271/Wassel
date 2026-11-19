package com.wassel.backend.roster.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.LiveRunCriteriaSupport;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-270, docs/contracts/roster.md "Changing a student's status": pausing, archiving and bringing a student back.
 * Real app, real repositories, PostgreSQL and every Flyway migration; the runs, confirmations and attendance that a
 * pause or an archive must leave alone are made through the real driver and head endpoints.
 */
class RosterStatusTests extends LiveRunCriteriaSupport {

	private MockHttpServletResponse setStatus(UUID student, String body) throws Exception {
		return send(put("/api/head-of-transport/students/" + student + "/status").with(head())
				.contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private MockHttpServletResponse change(UUID student, String status) throws Exception {
		return setStatus(student, "{\"status\":\"" + status + "\"}");
	}

	private String statusOf(UUID student) throws Exception {
		List<String> found = JsonPath.read(send(get("/api/head-of-transport/students").with(head())).getContentAsString(),
				"$[?(@.id == '" + student + "')].status");
		assertEquals(1, found.size());
		return found.get(0);
	}

	private String route(Bus bus) throws Exception {
		return send(get(ROUTES + "/" + bus.routeId()).with(head())).getContentAsString();
	}

	private List<String> stopIds(Bus bus) throws Exception {
		return JsonPath.read(route(bus), "$.stops[*].studentId");
	}

	private int seatsLeft(Bus bus) throws Exception {
		return JsonPath.read(route(bus), "$.seatsLeft");
	}

	// ---------------------------------------------------------------- leaving the route

	@Test
	void pausingAStudentTakesThemOffTheirRouteAndFreesTheSeatAndResumingDoesNotPutThemBack() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = stopAt("Rami", aParent(), FIRST);
		UUID salma = stopAt("Salma", aParent(), SECOND);
		onRoute(bus, rami, salma);
		int seats = seatsLeft(bus);

		MockHttpServletResponse paused = change(rami, "paused");

		assertEquals(200, paused.getStatus(), paused.getContentAsString());
		assertEquals("paused", JsonPath.read(paused.getContentAsString(), "$.status"));
		assertEquals(List.of(salma.toString()), stopIds(bus), "off the route, the other stop stays");
		assertEquals(seats + 1, seatsLeft(bus), "the seat is free at once");
		assertEquals("paused", statusOf(rami));

		MockHttpServletResponse back = change(rami, "active");
		assertEquals(200, back.getStatus(), back.getContentAsString());
		assertEquals("active", statusOf(rami));
		assertEquals(List.of(salma.toString()), stopIds(bus), "back to active, but on no route until they are placed");
	}

	@Test
	void archivingAStudentTakesThemOffTheirRouteToo() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = stopAt("Rami", aParent(), FIRST);
		onRoute(bus, rami);

		MockHttpServletResponse archived = change(rami, "inactive");

		assertEquals(200, archived.getStatus(), archived.getContentAsString());
		assertEquals("inactive", JsonPath.read(archived.getContentAsString(), "$.status"));
		assertEquals(List.of(), stopIds(bus));
	}

	@Test
	void aStudentWithAConfirmationOnABusRunningTodayStaysUntilTheRunEndsAndNothingChanges() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());

		MockHttpServletResponse refused = change(t.first(), "paused");
		MockHttpServletResponse archive = change(t.first(), "inactive");

		assertEquals(409, refused.getStatus(), refused.getContentAsString());
		assertEquals(409, archive.getStatus());
		assertTrue(((String) JsonPath.read(refused.getContentAsString(), "$.detail")).contains("Rami"),
				refused.getContentAsString());
		assertEquals("active", statusOf(t.first()), "the refusal changed no status");
		assertTrue(stopIds(t.bus()).contains(t.first().toString()), "and left them on the route");

		assertEquals(200, end(t.bus(), t.run()).getStatus());
		assertEquals(200, change(t.first(), "paused").getStatus(), "once the run has ended it is allowed");
		assertFalse(stopIds(t.bus()).contains(t.first().toString()));
	}

	@Test
	void aStudentWhoseRunIsInProgressButWhoHasNoConfirmationCanBePaused() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");

		assertEquals(200, change(t.second(), "paused").getStatus(),
				"only a student who is on the bus, as for taking a stop off a route, is held");
		assertFalse(stopIds(t.bus()).contains(t.second().toString()));
	}

	// ---------------------------------------------------------------- the rules

	@Test
	void everyChangeOfStatusIsAllowedExceptPausingAnArchivedStudentAndTheSameStatusAgainChangesNothing() throws Exception {
		UUID student = stopAt("Rami", aParent(), FIRST);
		assertEquals(200, change(student, "active").getStatus(), "active to active");

		assertEquals(200, change(student, "paused").getStatus());
		assertEquals(200, change(student, "paused").getStatus(), "paused again");
		assertEquals(200, change(student, "inactive").getStatus(), "paused to archived");
		assertEquals(200, change(student, "inactive").getStatus(), "archived again");

		MockHttpServletResponse refused = change(student, "paused");
		assertEquals(409, refused.getStatus(), "an archived student is restored first");
		assertEquals("An archived student can only be restored to active.",
				JsonPath.read(refused.getContentAsString(), "$.detail"));
		assertEquals("inactive", statusOf(student), "the refusal changed nothing");

		assertEquals(200, change(student, "active").getStatus(), "restored");
		assertEquals(200, change(student, "inactive").getStatus(), "active to archived");
		assertEquals(200, change(student, "active").getStatus());
		assertEquals(200, change(student, "paused").getStatus(), "active to paused");
		assertEquals(200, change(student, "active").getStatus(), "paused to active");
	}

	@Test
	void aRefusedChangeNeverTakesAnyoneOffARouteAndArchivingAgainRepairsAnArchivedStudentStillOnOne() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = stopAt("Rami", aParent(), FIRST);
		onRoute(bus, rami);
		// Data from before the roster rules: an archived student who is still a stop.
		Student stored = studentRepository.findById(rami).orElseThrow();
		stored.setStatus(StudentStatus.INACTIVE);
		studentRepository.save(stored);

		assertEquals(409, change(rami, "paused").getStatus(), "an archived student is restored first");
		assertEquals(List.of(rami.toString()), stopIds(bus), "the refusal took nobody off the route");

		assertEquals(200, change(rami, "inactive").getStatus(), "archiving again is allowed and releases the stop");
		assertEquals(List.of(), stopIds(bus));
	}

	@Test
	void aStatusThatIsNotOneOfTheThreeIsA400AndChangesNothing() throws Exception {
		UUID student = stopAt("Rami", aParent(), FIRST);
		List<String> accepted = new java.util.ArrayList<>();
		for (String body : List.of("{\"status\":\"retired\"}", "{\"status\":\"\"}", "{\"status\":\" \"}", "{}",
				"{\"status\":null}", "{\"status\":5}", "{\"status\":true}", "{\"status\":[\"active\"]}", "not json", "")) {
			MockHttpServletResponse response = setStatus(student, body);
			if (response.getStatus() != 400) {
				accepted.add(body + " -> " + response.getStatus());
			}
		}
		assertEquals(List.of(), accepted, "bodies that were not refused with a 400");
		assertEquals("active", statusOf(student));
	}

	@Test
	void theStatusMayBeWrittenInAnyCase() throws Exception {
		UUID student = stopAt("Rami", aParent(), FIRST);

		assertEquals(200, change(student, "PAUSED").getStatus());
		assertEquals("paused", statusOf(student));
		assertEquals(200, change(student, "Active").getStatus());
		assertEquals("active", statusOf(student));
	}

	// ---------------------------------------------------------------- who may

	@Test
	void anotherSchoolsHeadAndAnUnknownStudentAreA404AndOnlyAHeadMayChangeAStatus() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID student = stopAt("Rami", aParent(), FIRST);
		onRoute(bus, student);
		String url = "/api/head-of-transport/students/" + student + "/status";
		String body = "{\"status\":\"paused\"}";

		assertEquals(404, send(put(url).with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), UUID.randomUUID()))
				.contentType(MediaType.APPLICATION_JSON).content(body)).getStatus(), "another school's head");
		assertEquals(404, setStatus(UUID.randomUUID(), body).getStatus());
		for (Role role : List.of(Role.ADMIN, Role.DRIVER, Role.PARENT)) {
			assertEquals(403, send(put(url).with(as(role, UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
					.content(body)).getStatus(), role.name());
		}
		assertEquals(401, send(put(url).contentType(MediaType.APPLICATION_JSON).content(body)).getStatus());

		assertEquals("active", statusOf(student));
		assertEquals(List.of(student.toString()), stopIds(bus), "none of that took them off the route");
	}

	// ---------------------------------------------------------------- what a status means elsewhere

	@Test
	void aPausedOrArchivedStudentCannotBeAddedToARouteAndANewStatusOfActiveCan() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID student = stopAt("Rami", aParent(), FIRST);

		for (String status : List.of("paused", "inactive")) {
			assertEquals(200, change(student, status).getStatus());
			MockHttpServletResponse added = addToRoute(bus.routeId(), student);
			assertEquals(409, added.getStatus(), status + ": " + added.getContentAsString());
			assertEquals(List.of(), stopIds(bus));
			assertEquals(200, change(student, "active").getStatus());
		}
		assertEquals(200, addToRoute(bus.routeId(), student).getStatus(), "active again");
	}

	@Test
	void aPausedStudentIsFoundByTheStatusFilterOfTheRoster() throws Exception {
		UUID paused = stopAt("Rami", aParent(), FIRST);
		UUID active = stopAt("Salma", aParent(), SECOND);
		assertEquals(200, change(paused, "paused").getStatus());

		List<String> found = JsonPath.read(send(get("/api/head-of-transport/students").param("status", "paused")
				.with(head())).getContentAsString(), "$[*].id");

		assertEquals(List.of(paused.toString()), found);
		assertFalse(found.contains(active.toString()));
	}

	// ---------------------------------------------------------------- history

	@Test
	void archivingAStudentLeavesTheirPastRunsConfirmationsAndAttendanceExactlyAsTheyWere() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());
		assertEquals(200, confirm(t.bus(), t.run(), t.second(), "NOT_PRESENT").getStatus());
		assertEquals(200, end(t.bus(), t.run()).getStatus());
		String attendance = "/api/head-of-transport/attendance?from=2026-11-04&to=2026-11-04";
		String before = send(get(attendance).with(head())).getContentAsString();
		String auditBefore = send(get("/api/head-of-transport/attendance/audit?from=2026-11-04&to=2026-11-04").with(head()))
				.getContentAsString();
		assertEquals(2, ((List<?>) JsonPath.read(before, "$.items")).size());

		assertEquals(200, change(t.first(), "inactive").getStatus());
		assertEquals(200, change(t.second(), "paused").getStatus());

		assertEquals(before, send(get(attendance).with(head())).getContentAsString(), "the attendance is unchanged");
		assertEquals(auditBefore,
				send(get("/api/head-of-transport/attendance/audit?from=2026-11-04&to=2026-11-04").with(head()))
						.getContentAsString(), "and so is the audit");
		List<String> names = JsonPath.read(send(get(attendance).with(head())).getContentAsString(),
				"$.items[*].student.firstName");
		assertTrue(names.containsAll(List.of("Rami", "Salma")), "their names are still there: " + names);
		List<Map<String, Object>> stops = JsonPath.read(send(get(DRIVER_TODAY).with(as(Role.DRIVER,
				t.bus().driverUserId()))).getContentAsString(), "$.runs[?(@.id == '" + t.run() + "')].stops[*]");
		Map<String, Object> theirStop = stops.stream().filter(stop -> t.first().toString().equals(stop.get("studentId")))
				.findFirst().orElseThrow();
		assertEquals(Boolean.TRUE, theirStop.get("removedFromRoute"),
				"the driver's finished run still shows them, as having left the route");
		assertEquals("PICKED_UP", ((Map<?, ?>) theirStop.get("confirmation")).get("status"));
	}

	// ---------------------------------------------------------------- repeats and races

	@Test
	void pausingTwiceAtOnceTakesThemOffOnceAndBothAreAnswered() throws Exception {
		for (int round = 0; round < 3; round++) {
			Bus bus = aBus("Hamra morning run " + round);
			UUID rami = stopAt("Rami", aParent(), FIRST);
			UUID salma = stopAt("Salma", aParent(), SECOND);
			onRoute(bus, rami, salma);

			List<Integer> statuses = together(List.of(
					() -> change(rami, "paused").getStatus(),
					() -> change(rami, "paused").getStatus()));

			assertEquals(List.of(200, 200), statuses, "round " + round);
			assertEquals(List.of(salma.toString()), stopIds(bus));
			assertEquals("paused", statusOf(rami));
		}
	}

	@Test
	void pausingRacingResumingLeavesAConsistentStudent() throws Exception {
		for (int round = 0; round < 3; round++) {
			Bus bus = aBus("Hamra morning run " + round);
			UUID rami = stopAt("Rami", aParent(), FIRST);
			onRoute(bus, rami);
			assertEquals(200, change(rami, "paused").getStatus());

			List<Integer> statuses = together(List.of(
					() -> change(rami, "active").getStatus(),
					() -> change(rami, "paused").getStatus()));

			assertEquals(List.of(200, 200), statuses, "round " + round);
			String status = statusOf(rami);
			assertTrue(status.equals("active") || status.equals("paused"), status);
			assertEquals(List.of(), stopIds(bus), "either way they are on no route");
		}
	}

	// ---------------------------------------------------------------- the sample

	@Test
	void theContractsSampleHasTheFieldsOfAStudent() throws Exception {
		UUID student = stopAt("Rami", aParent(), FIRST);

		MockHttpServletResponse response = change(student, "paused");

		String sample = Files.readString(Path.of("../docs/contracts/samples/roster/student-paused.json"));
		assertEquals(keys(sample), keys(response.getContentAsString()));
		assertEquals("paused", JsonPath.read(sample, "$.status"));
		assertNull(JsonPath.read(sample, "$.route"));
	}

	@SuppressWarnings("unchecked")
	private static Set<String> keys(String json) {
		return new TreeSet<>(((Map<String, Object>) JsonPath.read(json, "$")).keySet());
	}
}
