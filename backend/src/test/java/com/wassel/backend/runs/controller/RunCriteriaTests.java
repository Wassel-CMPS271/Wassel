package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-242: independent tests of SCRUM-233 (daily runs), SCRUM-234 (start and end) and SCRUM-235 (confirmations),
 * written from {@code docs/contracts/runs.md} and the three tickets' acceptance criteria. Each test names the rule it
 * checks; the report in {@code docs/testing/SCRUM-242/} maps every criterion to its tests.
 */
class RunCriteriaTests extends RunCriteriaSupport {

	private static final String MORNING = "MORNING";

	private static final String AFTERNOON = "AFTERNOON";

	private static String run(String json, String direction, String path) {
		List<Object> values = JsonPath.read(json, "$.runs[?(@.direction == '" + direction + "')]" + path);
		assertEquals(1, values.size(), direction + path + " in " + json);
		return values.get(0) == null ? null : values.get(0).toString();
	}

	private static List<String> stopIds(String json, String direction) {
		return JsonPath.read(json, "$.runs[?(@.direction == '" + direction + "')].stops[*].studentId");
	}

	private static List<Integer> positions(String json, String direction) {
		return JsonPath.read(json, "$.runs[?(@.direction == '" + direction + "')].stops[*].position");
	}

	private static String stop(String runJson, UUID student, String field) {
		List<Object> values = JsonPath.read(runJson, "$.stops[?(@.studentId == '" + student + "')]." + field);
		assertEquals(1, values.size(), student + " in " + runJson);
		return values.get(0) == null ? null : values.get(0).toString();
	}

	private static List<String> asStrings(UUID... ids) {
		return java.util.Arrays.stream(ids).map(UUID::toString).toList();
	}

	// =============================================================== SCRUM-233: daily runs

	/** 233: one morning and one afternoon run for today, from the route's stops in their current order. */
	@Test
	void aDriverGetsTodaysMorningAndAfternoonRunsWithTheRoutesStopsInOrder() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = aStudent("Rami", null);
		UUID salma = aStudent("Salma", null);
		UUID tarek = aStudent("Tarek", null);
		onRoute(bus, rami, salma, tarek);

		String day = driverToday(bus);

		assertEquals(WEDNESDAY.toString(), JsonPath.read(day, "$.date"));
		assertEquals("SCHOOL_DAY", JsonPath.read(day, "$.dayType"));
		assertEquals(List.of(MORNING, AFTERNOON), JsonPath.read(day, "$.runs[*].direction"));
		assertEquals(List.of("NOT_STARTED", "NOT_STARTED"), JsonPath.read(day, "$.runs[*].state"));
		assertEquals(asStrings(rami, salma, tarek), stopIds(day, MORNING));
		assertEquals(List.of(1, 2, 3), positions(day, MORNING));
		List<String> morningTimes = JsonPath.read(day, "$.runs[0].stops[*].arrivalTime");
		assertTrue(morningTimes.stream().allMatch(time -> time != null), "pinned morning stops have times: " + morningTimes);
		assertEquals("07:30", run(day, MORNING, ".schoolTime"));
		assertEquals("Hamra morning run", run(day, MORNING, ".route.name"));
		assertEquals(bus.vehicleId().toString(), run(day, MORNING, ".vehicle.id"));
		assertEquals(bus.driverId().toString(), run(day, MORNING, ".driver.id"));
		assertEquals("Guardian of Rami", JsonPath.read(day, "$.runs[0].stops[0].guardianName"));
		assertEquals(false, JsonPath.read(day, "$.runs[0].stops[0].absent"));
		assertNull(JsonPath.read(day, "$.runs[0].stops[0].confirmation"));
		assertEquals(false, JsonPath.read(day, "$.runs[0].stops[0].removedFromRoute"));
		assertEquals("3", run(day, MORNING, ".counts.students"));
	}

	/** Contract: the afternoon is the morning's students reversed, renumbered 1..n, with no times. */
	@Test
	void theAfternoonRunIsTheMorningReversedWithNoTimes() throws Exception {
		Bus bus = aBus("Verdun morning run");
		UUID rami = aStudent("Rami", null);
		UUID salma = aStudent("Salma", null);
		UUID tarek = aStudent("Tarek", null);
		onRoute(bus, rami, salma, tarek);

		String day = driverToday(bus);

		assertEquals(asStrings(tarek, salma, rami), stopIds(day, AFTERNOON));
		assertEquals(List.of(1, 2, 3), positions(day, AFTERNOON));
		List<Object> times = JsonPath.read(day, "$.runs[1].stops[*].arrivalTime");
		assertTrue(times.stream().allMatch(time -> time == null), "afternoon times: " + times);
		assertEquals("14:00", run(day, AFTERNOON, ".schoolTime"));
	}

	/** 233: asking twice never creates duplicates. */
	@Test
	void askingAgainReturnsTheSameTwoRuns() throws Exception {
		Bus bus = aBus("Hamra morning run");

		List<String> first = JsonPath.read(driverToday(bus), "$.runs[*].id");
		List<String> second = JsonPath.read(driverToday(bus), "$.runs[*].id");
		List<String> head = JsonPath.read(headRuns(null), "$.runs[*].id");

		assertEquals(2, first.size());
		assertEquals(first, second);
		assertEquals(first, head);
	}

	/** 233: "including under concurrent requests": drivers and heads asking at the same instant. */
	@Test
	void simultaneousRequestsCreateEachRunOnce() throws Exception {
		Bus hamra = aBus("Hamra morning run");
		Bus verdun = aBus("Verdun morning run");
		int requests = 16;
		CountDownLatch go = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(requests);
		List<Future<MockHttpServletResponse>> answers = new ArrayList<>();
		try {
			for (int i = 0; i < requests; i++) {
				int n = i;
				Callable<MockHttpServletResponse> ask = () -> {
					go.await();
					return switch (n % 3) {
						case 0 -> send(get(HEAD_RUNS).with(head()));
						case 1 -> send(get(DRIVER_TODAY).with(as(Role.DRIVER, hamra.driverUserId())));
						default -> send(get(DRIVER_TODAY).with(as(Role.DRIVER, verdun.driverUserId())));
					};
				};
				answers.add(pool.submit(ask));
			}
			go.countDown();
			for (Future<MockHttpServletResponse> answer : answers) {
				assertEquals(200, answer.get().getStatus(), answer.get().getContentAsString());
			}
		} finally {
			pool.shutdown();
		}

		List<String> ids = JsonPath.read(headRuns(null), "$.runs[*].id");
		assertEquals(4, ids.size(), ids.toString());
		assertEquals(4, ids.stream().distinct().count());
	}

	/** 233: no runs on a holiday, and (contract) Saturday and Sunday are holidays too. */
	@Test
	void aHolidayAndAWeekendHaveNoRuns() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, aStudent("Rami", null));
		aHoliday(WEDNESDAY);

		String holiday = driverToday(bus);
		assertEquals("HOLIDAY", JsonPath.read(holiday, "$.dayType"));
		assertEquals(List.of(), JsonPath.read(holiday, "$.runs"));
		assertEquals(List.of(), JsonPath.read(headRuns(null), "$.runs"));

		for (LocalDate weekend : List.of(LocalDate.of(2026, 11, 7), LocalDate.of(2026, 11, 8))) {
			setNow(weekend, LocalTime.of(8, 0));
			String day = driverToday(bus);
			assertEquals("HOLIDAY", JsonPath.read(day, "$.dayType"), weekend.toString());
			assertEquals(List.of(), JsonPath.read(day, "$.runs"));
		}
	}

	/** Contract: a holiday added after the runs exist hides them; removing it shows the same runs again. */
	@Test
	void aHolidayAddedLaterHidesTheRunsAndRemovingItShowsTheSameOnes() throws Exception {
		Bus bus = aBus("Hamra morning run");
		List<String> before = JsonPath.read(driverToday(bus), "$.runs[*].id");

		aHoliday(WEDNESDAY);
		assertEquals(List.of(), JsonPath.read(driverToday(bus), "$.runs"));

		holidayRepository.deleteAll(holidayRepository.findAll().stream()
				.filter(holiday -> holiday.getSchoolId().equals(school)).toList());
		assertEquals(before, JsonPath.read(driverToday(bus), "$.runs[*].id"));
	}

	/** 233, settled by the contract's "No half-day times": the afternoon run's schoolTime is null on a half-day. */
	@Test
	void aHalfDayKeepsTheMorningTimeAndHasNoAfternoonTime() throws Exception {
		Bus bus = aBus("Hamra morning run");
		aHalfDay(WEDNESDAY);

		String day = driverToday(bus);

		assertEquals("HALF_DAY", JsonPath.read(day, "$.dayType"));
		assertEquals("07:30", run(day, MORNING, ".schoolTime"));
		assertNull(run(day, AFTERNOON, ".schoolTime"));
		assertNull(JsonPath.read(headRuns(null), "$.runs[1].schoolTime"));
	}

	/** Contract: schoolTime is null when the school has not set it. */
	@Test
	void schoolTimeIsNullWhenTheSchoolHasNotSetIt() throws Exception {
		schoolSettingsRepository.deleteById(school);
		Bus bus = aBus("Hamra morning run");

		String day = driverToday(bus);

		assertNull(run(day, MORNING, ".schoolTime"));
		assertNull(run(day, AFTERNOON, ".schoolTime"));
	}

	/** 233: a driver fetches only their own runs; one with no route gets a school day with no runs. */
	@Test
	void aDriverSeesOnlyTheirOwnRunsAndOneWithNoRouteSeesNone() throws Exception {
		Bus hamra = aBus("Hamra morning run");
		Bus verdun = aBus("Verdun morning run");
		UUID noRouteUser = aDriverAccount();
		aDriverRecord(noRouteUser);

		assertEquals(List.of(hamra.routeId(), hamra.routeId()), JsonPath.read(driverToday(hamra), "$.runs[*].route.id"));
		assertEquals(List.of(verdun.routeId(), verdun.routeId()), JsonPath.read(driverToday(verdun), "$.runs[*].route.id"));
		String none = send(get(DRIVER_TODAY).with(as(Role.DRIVER, noRouteUser))).getContentAsString();
		assertEquals("SCHOOL_DAY", JsonPath.read(none, "$.dayType"));
		assertEquals(List.of(), JsonPath.read(none, "$.runs"));
	}

	/** 233: the head sees every run, routes oldest first, morning before afternoon, without stops. */
	@Test
	void theHeadSeesEveryRouteInOrderWithoutStops() throws Exception {
		Bus hamra = aBus("Hamra morning run");
		Bus verdun = aBus("Verdun morning run");
		onRoute(hamra, aStudent("Rami", null));

		String day = headRuns(null);

		assertEquals(List.of(hamra.routeId(), hamra.routeId(), verdun.routeId(), verdun.routeId()),
				JsonPath.read(day, "$.runs[*].route.id"));
		assertEquals(List.of(MORNING, AFTERNOON, MORNING, AFTERNOON), JsonPath.read(day, "$.runs[*].direction"));
		List<Object> stops = JsonPath.read(day, "$.runs[*].stops");
		assertTrue(stops.isEmpty(), "a RunSummary has no stops: " + stops);
		assertEquals(1, (int) JsonPath.read(day, "$.runs[0].counts.students"));
	}

	/** Contract: only today's request creates runs; another date only reads what exists. */
	@Test
	void anotherDateOnlyReadsAndCreatesNothing() throws Exception {
		aBus("Hamra morning run");

		String tomorrow = headRuns(WEDNESDAY.plusDays(1).toString());
		String yesterday = headRuns(WEDNESDAY.minusDays(1).toString());

		assertEquals("SCHOOL_DAY", JsonPath.read(tomorrow, "$.dayType"));
		assertEquals(List.of(), JsonPath.read(tomorrow, "$.runs"));
		assertEquals(List.of(), JsonPath.read(yesterday, "$.runs"));
		// Today's runs, made now, are still on that date afterwards: a past date shows what happened.
		List<String> today = JsonPath.read(headRuns(null), "$.runs[*].id");
		setNow(WEDNESDAY.plusDays(1), LocalTime.of(8, 0));
		assertEquals(today, JsonPath.read(headRuns(WEDNESDAY.toString()), "$.runs[*].id"));
	}

	/** Contract: another school's head sees none of these runs. */
	@Test
	void anotherSchoolSeesNothing() throws Exception {
		aBus("Hamra morning run");
		headRuns(null);

		String other = send(get(HEAD_RUNS).with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), UUID.randomUUID())))
				.getContentAsString();

		assertEquals(List.of(), JsonPath.read(other, "$.runs"));
	}

	/** Contract: a live roster: a reorder shows on the same runs at once. */
	@Test
	void aReorderShowsOnTheSameRunsAtOnce() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = aStudent("Rami", null);
		UUID salma = aStudent("Salma", null);
		onRoute(bus, rami, salma);
		String before = driverToday(bus);

		assertEquals(200, reorder(bus.routeId(), salma, rami).getStatus());
		String after = driverToday(bus);

		assertEquals((List<String>) JsonPath.read(before, "$.runs[*].id"), JsonPath.read(after, "$.runs[*].id"));
		assertEquals(asStrings(salma, rami), stopIds(after, MORNING));
		assertEquals(asStrings(rami, salma), stopIds(after, AFTERNOON));
	}

	// =============================================================== SCRUM-234: start and end

	/** 234: start saves the start time, end saves the end time, and the head sees both. */
	@Test
	void startAndEndSaveTheirTimesAndTheHeadSeesThem() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String morning = runId(bus, MORNING);

		MockHttpServletResponse started = start(bus, morning);
		assertEquals(200, started.getStatus(), started.getContentAsString());
		assertEquals("IN_PROGRESS", JsonPath.read(started.getContentAsString(), "$.state"));
		assertEquals(WEDNESDAY_7AM, Instant.parse(JsonPath.read(started.getContentAsString(), "$.startedAt")));
		assertEquals("IN_PROGRESS", run(headRuns(null), MORNING, ".state"));

		clock.set(WEDNESDAY_7AM.plusSeconds(40 * 60));
		MockHttpServletResponse ended = end(bus, morning);
		assertEquals(200, ended.getStatus(), ended.getContentAsString());
		assertEquals("FINISHED", JsonPath.read(ended.getContentAsString(), "$.state"));
		assertEquals(WEDNESDAY_7AM.plusSeconds(40 * 60), Instant.parse(JsonPath.read(ended.getContentAsString(), "$.endedAt")));

		String head = headRuns(null);
		assertEquals("FINISHED", run(head, MORNING, ".state"));
		assertEquals(WEDNESDAY_7AM, Instant.parse(run(head, MORNING, ".startedAt")));
		assertEquals(WEDNESDAY_7AM.plusSeconds(40 * 60), Instant.parse(run(head, MORNING, ".endedAt")));
	}

	/** Contract: a repeated start or end is a 200 that keeps the first time. */
	@Test
	void aRepeatedStartOrEndChangesNothing() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String morning = runId(bus, MORNING);
		start(bus, morning);

		clock.set(WEDNESDAY_7AM.plusSeconds(60));
		MockHttpServletResponse again = start(bus, morning);
		assertEquals(200, again.getStatus());
		assertEquals(WEDNESDAY_7AM, Instant.parse(JsonPath.read(again.getContentAsString(), "$.startedAt")));

		end(bus, morning);
		clock.set(WEDNESDAY_7AM.plusSeconds(600));
		MockHttpServletResponse endAgain = end(bus, morning);
		assertEquals(200, endAgain.getStatus());
		assertEquals(WEDNESDAY_7AM.plusSeconds(60), Instant.parse(JsonPath.read(endAgain.getContentAsString(), "$.endedAt")));
	}

	/** 234: starting a finished run, or ending one not started, is a 409 naming the state. */
	@Test
	void startingAFinishedRunOrEndingOneNotStartedIsAConflictNamingTheState() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String morning = runId(bus, MORNING);
		String afternoon = runId(bus, AFTERNOON);

		MockHttpServletResponse endNotStarted = end(bus, afternoon);
		assertEquals(409, endNotStarted.getStatus());
		assertTrue(endNotStarted.getContentAsString().contains("NOT_STARTED"), endNotStarted.getContentAsString());

		start(bus, morning);
		end(bus, morning);
		MockHttpServletResponse startFinished = start(bus, morning);
		assertEquals(409, startFinished.getStatus());
		assertTrue(startFinished.getContentAsString().contains("FINISHED"), startFinished.getContentAsString());
	}

	/** Contract: either direction can start first, and each has its own state. */
	@Test
	void theAfternoonRunCanStartBeforeTheMorningOne() throws Exception {
		Bus bus = aBus("Hamra morning run");

		assertEquals(200, start(bus, runId(bus, AFTERNOON)).getStatus());

		String day = driverToday(bus);
		assertEquals("NOT_STARTED", run(day, MORNING, ".state"));
		assertEquals("IN_PROGRESS", run(day, AFTERNOON, ".state"));
	}

	/** 234 (security): another driver, a driver of another school, or an unknown id: the same 404. */
	@Test
	void aRunThatIsNotTheDriversIsNotFound() throws Exception {
		Bus mine = aBus("Hamra morning run");
		Bus theirs = aBus("Verdun morning run");
		String myRun = runId(mine, MORNING);

		assertEquals(404, start(theirs, myRun).getStatus());
		assertEquals(404, end(theirs, myRun).getStatus());
		assertEquals(404, start(mine, UUID.randomUUID().toString()).getStatus());
		MockHttpServletResponse fromAnotherSchool = send(post("/api/driver/runs/" + myRun + "/start")
				.with(as(Role.DRIVER, mine.driverUserId(), UUID.randomUUID())));
		assertEquals(404, fromAnotherSchool.getStatus());
		assertEquals("NOT_STARTED", run(driverToday(mine), MORNING, ".state"));
	}

	/** Contract: yesterday's run, or one hidden by a holiday added later, is a 404, even for a repeated end. */
	@Test
	void yesterdaysRunAndAHolidayHiddenRunAreNotFound() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String morning = runId(bus, MORNING);
		String afternoon = runId(bus, AFTERNOON);
		start(bus, morning);
		end(bus, morning);

		aHoliday(WEDNESDAY);
		assertEquals(404, start(bus, afternoon).getStatus());

		holidayRepository.deleteAll(holidayRepository.findAll().stream()
				.filter(holiday -> holiday.getSchoolId().equals(school)).toList());
		setNow(WEDNESDAY.plusDays(1), LocalTime.of(7, 0));
		assertEquals(404, end(bus, morning).getStatus(), "a repeated end after midnight");
		assertEquals(404, start(bus, afternoon).getStatus());
	}

	/** Errors table: an id in the path that does not parse is a 400. */
	@Test
	void aRunIdThatDoesNotParseIsABadRequest() throws Exception {
		Bus bus = aBus("Hamra morning run");

		MockHttpServletResponse answer = start(bus, "not-a-uuid");

		assertEquals(400, answer.getStatus());
		assertEquals("Invalid request parameter", JsonPath.read(answer.getContentAsString(), "$.detail"));
	}

	// =============================================================== SCRUM-235: confirmations

	private record Running(Bus bus, String morning, UUID rami, UUID salma, UUID tarek) {
	}

	/** A route of three, its morning run started at 07:00. */
	private Running aMorningInProgress() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = aStudent("Rami", null);
		UUID salma = aStudent("Salma", null);
		UUID tarek = aStudent("Tarek", null);
		onRoute(bus, rami, salma, tarek);
		String morning = runId(bus, MORNING);
		assertEquals(200, start(bus, morning).getStatus());
		return new Running(bus, morning, rami, salma, tarek);
	}

	/** 235: each status is recorded with the server's time, and a client's time is ignored. */
	@Test
	void aConfirmationIsRecordedWithTheServersTime() throws Exception {
		Running r = aMorningInProgress();
		clock.set(WEDNESDAY_7AM.plusSeconds(7 * 60));

		MockHttpServletResponse answer = send(put("/api/driver/runs/" + r.morning() + "/students/" + r.rami()
				+ "/confirmation").with(as(Role.DRIVER, r.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"status\":\"PICKED_UP\",\"at\":\"2020-01-01T00:00:00Z\"}"));

		assertEquals(200, answer.getStatus(), answer.getContentAsString());
		String json = answer.getContentAsString();
		assertEquals("PICKED_UP", stop(json, r.rami(), "confirmation.status"));
		assertEquals(WEDNESDAY_7AM.plusSeconds(7 * 60), Instant.parse(stop(json, r.rami(), "confirmation.at")));
		assertEquals(r.morning(), JsonPath.read(json, "$.id"));
	}

	/** 235 and the table: none to picked up to dropped off, and not present to picked up (came late). */
	@Test
	void theAllowedMovesAreRecorded() throws Exception {
		Running r = aMorningInProgress();

		assertEquals(200, confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP").getStatus());
		assertEquals(200, confirm(r.bus(), r.morning(), r.rami(), "DROPPED_OFF").getStatus());
		assertEquals(200, confirm(r.bus(), r.morning(), r.salma(), "NOT_PRESENT").getStatus());
		MockHttpServletResponse late = confirm(r.bus(), r.morning(), r.salma(), "PICKED_UP");

		assertEquals(200, late.getStatus());
		String json = late.getContentAsString();
		assertEquals("DROPPED_OFF", stop(json, r.rami(), "confirmation.status"));
		assertEquals("PICKED_UP", stop(json, r.salma(), "confirmation.status"));
		assertNull(stop(json, r.tarek(), "confirmation"));
	}

	/** The table: every other move is a 409, and the 409 names the current status. */
	@Test
	void theRefusedMovesAreConflictsNamingTheCurrentStatus() throws Exception {
		Running r = aMorningInProgress();

		// 235: no drop-off before a pickup.
		assertEquals(409, confirm(r.bus(), r.morning(), r.rami(), "DROPPED_OFF").getStatus());

		confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");
		MockHttpServletResponse notPresentAfterPickup = confirm(r.bus(), r.morning(), r.rami(), "NOT_PRESENT");
		assertEquals(409, notPresentAfterPickup.getStatus());
		assertTrue(notPresentAfterPickup.getContentAsString().contains("PICKED_UP"),
				notPresentAfterPickup.getContentAsString());

		confirm(r.bus(), r.morning(), r.salma(), "NOT_PRESENT");
		MockHttpServletResponse dropAfterNotPresent = confirm(r.bus(), r.morning(), r.salma(), "DROPPED_OFF");
		assertEquals(409, dropAfterNotPresent.getStatus());
		assertTrue(dropAfterNotPresent.getContentAsString().contains("NOT_PRESENT"),
				dropAfterNotPresent.getContentAsString());

		confirm(r.bus(), r.morning(), r.rami(), "DROPPED_OFF");
		MockHttpServletResponse afterDropOff = confirm(r.bus(), r.morning(), r.rami(), "NOT_PRESENT");
		assertEquals(409, afterDropOff.getStatus());
		assertTrue(afterDropOff.getContentAsString().contains("DROPPED_OFF"), afterDropOff.getContentAsString());
	}

	/** 235: the same confirmation twice keeps one record and the first time. */
	@Test
	void theSameConfirmationTwiceKeepsTheFirstTime() throws Exception {
		Running r = aMorningInProgress();
		confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");

		clock.set(WEDNESDAY_7AM.plusSeconds(300));
		MockHttpServletResponse again = confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");

		assertEquals(200, again.getStatus());
		assertEquals(WEDNESDAY_7AM, Instant.parse(stop(again.getContentAsString(), r.rami(), "confirmation.at")));
		assertEquals("1", run(headRuns(null), MORNING, ".counts.pickedUp"));
	}

	/** Contract: a retry of an earlier status after a later one is a 200, and the later one stays. */
	@Test
	void aLateRetryOfAnEarlierStatusKeepsTheLaterOne() throws Exception {
		Running r = aMorningInProgress();
		confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");
		confirm(r.bus(), r.morning(), r.rami(), "DROPPED_OFF");

		MockHttpServletResponse retry = confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");

		assertEquals(200, retry.getStatus());
		assertEquals("DROPPED_OFF", stop(retry.getContentAsString(), r.rami(), "confirmation.status"));
	}

	/** 235: only a student on that run can be confirmed (404). */
	@Test
	void aStudentWhoIsNotOnTheRunIsNotFound() throws Exception {
		Running r = aMorningInProgress();
		UUID notOnTheRoute = aStudent("Layla", null);

		assertEquals(404, confirm(r.bus(), r.morning(), notOnTheRoute, "PICKED_UP").getStatus());
		assertEquals(404, confirm(r.bus(), r.morning(), UUID.randomUUID(), "PICKED_UP").getStatus());
	}

	/** 235: confirmations are refused (409 naming the state) unless the run is in progress. */
	@Test
	void aConfirmationOutsideAnInProgressRunIsAConflict() throws Exception {
		Running r = aMorningInProgress();
		String afternoon = runId(r.bus(), AFTERNOON);

		MockHttpServletResponse notStarted = confirm(r.bus(), afternoon, r.rami(), "PICKED_UP");
		assertEquals(409, notStarted.getStatus());
		assertTrue(notStarted.getContentAsString().contains("NOT_STARTED"), notStarted.getContentAsString());

		end(r.bus(), r.morning());
		MockHttpServletResponse finished = confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");
		assertEquals(409, finished.getStatus());
		assertTrue(finished.getContentAsString().contains("FINISHED"), finished.getContentAsString());
	}

	/** 242 (security): a driver cannot confirm on another driver's run. */
	@Test
	void anotherDriverCannotConfirmOnTheRun() throws Exception {
		Running r = aMorningInProgress();
		Bus other = aBus("Verdun morning run");

		assertEquals(404, confirm(other, r.morning(), r.rami(), "PICKED_UP").getStatus());
		assertEquals(0, (int) JsonPath.read(headRuns(null), "$.runs[0].counts.pickedUp"), "Hamra is the first route");
	}

	/** Contract check order: a run that is not the driver's is 404 before the student or the state is looked at. */
	@Test
	void theRunIsCheckedBeforeTheStudentAndTheState() throws Exception {
		Running r = aMorningInProgress();
		Bus other = aBus("Verdun morning run");
		String notStartedAfternoon = runId(r.bus(), AFTERNOON);

		assertEquals(404, confirm(other, notStartedAfternoon, UUID.randomUUID(), "DROPPED_OFF").getStatus());
		// The student before the state: an unknown student on a run that is not in progress is a 404, not a 409.
		assertEquals(404, confirm(r.bus(), notStartedAfternoon, UUID.randomUUID(), "PICKED_UP").getStatus());
	}

	/** 235: the head's runs show real counts: pickedUp includes those dropped off. */
	@Test
	void theHeadsCountsFollowTheConfirmations() throws Exception {
		Running r = aMorningInProgress();
		confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");
		confirm(r.bus(), r.morning(), r.rami(), "DROPPED_OFF");
		confirm(r.bus(), r.morning(), r.salma(), "PICKED_UP");
		confirm(r.bus(), r.morning(), r.tarek(), "NOT_PRESENT");

		Map<String, Integer> counts = JsonPath.read(headRuns(null), "$.runs[0].counts");

		assertEquals(Map.of("students", 3, "absent", 0, "pickedUp", 2, "droppedOff", 1, "notPresent", 1), counts);
	}

	/** Contract: an absent child can still be confirmed, and the confirmation wins in the counts. */
	@Test
	void anAbsentChildCanStillBeConfirmedAndThenCountsUnderThatStatus() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID rami = aStudent("Rami", parent);
		UUID salma = aStudent("Salma", null);
		onRoute(bus, rami, salma);
		absentToday(parent, rami);
		String morning = runId(bus, MORNING);
		start(bus, morning);
		assertEquals("1", run(driverToday(bus), MORNING, ".counts.absent"));
		assertEquals("true", JsonPath.read(driverToday(bus), "$.runs[0].stops[0].absent").toString());

		MockHttpServletResponse answer = confirm(bus, morning, rami, "PICKED_UP");

		assertEquals(200, answer.getStatus());
		assertEquals("true", stop(answer.getContentAsString(), rami, "absent"));
		Map<String, Integer> counts = JsonPath.read(answer.getContentAsString(), "$.counts");
		assertEquals(0, counts.get("absent"));
		assertEquals(1, counts.get("pickedUp"));
	}

	/**
	 * FINDING F-1 (see docs/testing/SCRUM-242/SCRUM-242-test-report.md), fixed by SCRUM-260 (#118): the contract
	 * defines {@code counts.absent} once, for every run, and a {@code RunSummary} is "a {@code Run} without
	 * {@code stops}" — the head of transportation's summary now computes it from the route's roster instead of
	 * answering 0.
	 */
	@Test
	void theHeadsSummaryCountsAbsentStopsLikeTheDriversRun() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID rami = aStudent("Rami", parent);
		onRoute(bus, rami, aStudent("Salma", null));
		absentToday(parent, rami);

		assertEquals(run(driverToday(bus), MORNING, ".counts.absent"), run(headRuns(null), MORNING, ".counts.absent"));
	}

	/** Errors table: a missing status, an unknown status. */
	@Test
	void aMissingOrUnknownStatusIsABadRequest() throws Exception {
		Running r = aMorningInProgress();
		String url = "/api/driver/runs/" + r.morning() + "/students/" + r.rami() + "/confirmation";

		MockHttpServletResponse missing = send(put(url).with(as(Role.DRIVER, r.bus().driverUserId()))
				.contentType(MediaType.APPLICATION_JSON).content("{}"));
		MockHttpServletResponse unknown = confirm(r.bus(), r.morning(), r.rami(), "ON_THE_BUS");

		assertEquals(400, missing.getStatus());
		assertNotNull(JsonPath.read(missing.getContentAsString(), "$.errors.status"));
		assertEquals(400, unknown.getStatus());
		assertEquals("Malformed request body", JsonPath.read(unknown.getContentAsString(), "$.detail"));
	}

	// =============================================================== moving a student or a driver during a run

	/** Contract: a child on a bus stays on their route until the run ends; the 409 names them and the route. */
	@Test
	void aChildOnTheBusCannotBeMovedUntilTheRunEnds() throws Exception {
		Running r = aMorningInProgress();
		Bus verdun = aBus("Verdun morning run");
		setNow(WEDNESDAY, LocalTime.of(7, 12));
		confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");

		MockHttpServletResponse move = addToRoute(verdun.routeId(), r.rami());
		MockHttpServletResponse remove = removeFromRoute(r.bus().routeId(), r.rami());

		for (MockHttpServletResponse refused : List.of(move, remove)) {
			assertEquals(409, refused.getStatus(), refused.getContentAsString());
			String detail = JsonPath.read(refused.getContentAsString(), "$.detail");
			assertTrue(detail.contains("Rami") && detail.contains("Hamra") && detail.contains("07:12"), detail);
		}
		// Not a move: re-adding them to the route they are on.
		assertEquals(200, addToRoute(r.bus().routeId(), r.rami()).getStatus());

		end(r.bus(), r.morning());
		assertEquals(200, addToRoute(verdun.routeId(), r.rami()).getStatus());
	}

	/** Contract: a child who was confirmed and then left the route stays on that run, last, removedFromRoute. */
	@Test
	void aConfirmedChildWhoLeftTheRouteStaysOnTheRunLast() throws Exception {
		Running r = aMorningInProgress();
		confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");
		end(r.bus(), r.morning());
		assertEquals(200, removeFromRoute(r.bus().routeId(), r.rami()).getStatus());

		String day = driverToday(r.bus());

		assertEquals(asStrings(r.salma(), r.tarek(), r.rami()), stopIds(day, MORNING));
		assertEquals(List.of(1, 2, 3), positions(day, MORNING));
		List<Boolean> removed = JsonPath.read(day, "$.runs[0].stops[*].removedFromRoute");
		assertEquals(List.of(false, false, true), removed);
		assertEquals("3", run(day, MORNING, ".counts.students"));
		assertEquals("1", run(day, MORNING, ".counts.pickedUp"));
		// The afternoon run has no confirmation of theirs, so they are simply gone from it.
		assertEquals(asStrings(r.tarek(), r.salma()), stopIds(day, AFTERNOON));
	}

	/** Contract: an unconfirmed child moved during the run leaves it at once. */
	@Test
	void anUnconfirmedChildMovedDuringTheRunLeavesItAtOnce() throws Exception {
		Running r = aMorningInProgress();

		assertEquals(200, removeFromRoute(r.bus().routeId(), r.tarek()).getStatus());

		assertFalse(stopIds(driverToday(r.bus()), MORNING).contains(r.tarek().toString()));
	}

	/** Contract: the route's driver or vehicle cannot change while one of its runs is in progress; a rename can. */
	@Test
	void theDriverOrVehicleCannotChangeWhileARunIsInProgress() throws Exception {
		Running r = aMorningInProgress();
		UUID otherVehicle = aVehicle();
		String url = ROUTES + "/" + r.bus().routeId();
		String swap = "{\"name\":\"Hamra morning run\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}"
				.formatted(otherVehicle, r.bus().driverId());
		String rename = "{\"name\":\"Hamra run\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}"
				.formatted(r.bus().vehicleId(), r.bus().driverId());

		MockHttpServletResponse refused = send(put(url).with(head()).contentType(MediaType.APPLICATION_JSON).content(swap));
		assertEquals(409, refused.getStatus());
		String detail = JsonPath.read(refused.getContentAsString(), "$.detail");
		assertTrue(detail.contains("Hamra morning run") && detail.toLowerCase().contains("morning"), detail);
		assertEquals(200, send(put(url).with(head()).contentType(MediaType.APPLICATION_JSON).content(rename)).getStatus());

		end(r.bus(), r.morning());
		assertEquals(200, send(put(url).with(head()).contentType(MediaType.APPLICATION_JSON)
				.content(swap.replace("Hamra morning run", "Hamra run"))).getStatus());
	}

	/** Contract: a run left in progress on an earlier date never blocks a move today. */
	@Test
	void aRunLeftInProgressYesterdayBlocksNothingToday() throws Exception {
		Running r = aMorningInProgress();
		confirm(r.bus(), r.morning(), r.rami(), "PICKED_UP");
		Bus verdun = aBus("Verdun morning run");

		setNow(WEDNESDAY.plusDays(1), LocalTime.of(9, 0));

		assertEquals(200, addToRoute(verdun.routeId(), r.rami()).getStatus());
	}
}
