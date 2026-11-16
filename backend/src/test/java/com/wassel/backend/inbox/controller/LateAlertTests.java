package com.wassel.backend.inbox.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.inbox.service.LateAlertService;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-268, against {@code docs/contracts/inbox.md} "Late alerts". Real app, real repositories, PostgreSQL and every
 * Flyway migration; the test profile has no road provider, so the planned times and the live estimate use the routing
 * contract's straight lines (30 km/h, each leg rounded up to whole minutes). The planned times are read from the route
 * the head of transportation sees, and the clock is moved to the second around them.
 *
 * <p>The job is called as {@code LateAlertService.raise()}. Other tests leave runs in progress in the shared database
 * and the job reads every school, so these tests look at their own parents' inboxes and never at how many entries the
 * call made in all.
 */
class LateAlertTests extends RunCriteriaSupport {

	private static final double LONGITUDE = 35.50;

	// Three stops on one meridian, in this order, and where the bus usually is before the first.
	private static final double FIRST = 33.90;

	private static final double SECOND = 33.91;

	private static final double THIRD = 33.93;

	private static final double BEFORE_FIRST = 33.89;

	// Far enough south that the first stop is 67 minutes away: 0.30 degree is 33.36 km, 66.7 minutes at 30 km/h.
	private static final double FAR_AWAY = 33.60;

	private static final AtomicInteger UNIQUE = new AtomicInteger();

	@Autowired
	private LateAlertService lateAlertService;

	/** A started morning run of three stops, one parent each, and when each stop is planned (school-local). */
	private record Trip(Bus bus, String run, UUID first, UUID second, UUID third, UUID parentOfFirst,
			UUID parentOfSecond, UUID parentOfThird, LocalTime plannedFirst, LocalTime plannedSecond,
			LocalTime plannedThird) {
	}

	private UUID stopAt(String name, UUID parent, Double latitude) {
		int n = UNIQUE.incrementAndGet();
		return studentRepository.save(Student.builder().schoolId(school).firstName(name).lastName("Nasr").grade("4")
				.guardianName("Guardian of " + name).guardianPhone("+961 3 " + (800000 + n))
				.status(StudentStatus.ACTIVE).address(name + " Street, Beirut")
				.latitude(latitude == null ? null : BigDecimal.valueOf(latitude))
				.longitude(latitude == null ? null : BigDecimal.valueOf(LONGITUDE)).parentUserId(parent).build()).getId();
	}

	private LocalTime plannedOf(Bus bus, UUID student) throws Exception {
		String route = send(get(ROUTES + "/" + bus.routeId()).with(head())).getContentAsString();
		List<String> times = JsonPath.read(route, "$.stops[?(@.studentId == '" + student + "')].arrivalTime");
		assertEquals(1, times.size());
		assertNotNull(times.get(0), "the route has a schedule: the school's arrival time is set and every stop has a pin");
		return LocalTime.parse(times.get(0));
	}

	private Trip aTrip() throws Exception {
		return aTripOn(WEDNESDAY);
	}

	/** The trip's morning run started at 07:00 on this school day. */
	private Trip aTripOn(LocalDate day) throws Exception {
		setNow(day, LocalTime.of(7, 0));
		UUID pFirst = aParent();
		UUID pSecond = aParent();
		UUID pThird = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID first = stopAt("Rami", pFirst, FIRST);
		UUID second = stopAt("Salma", pSecond, SECOND);
		UUID third = stopAt("Dana", pThird, THIRD);
		onRoute(bus, first, second, third);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		return new Trip(bus, run, first, second, third, pFirst, pSecond, pThird, plannedOf(bus, first),
				plannedOf(bus, second), plannedOf(bus, third));
	}

	private void at(LocalDate day, LocalTime time, long extraSeconds) {
		setNow(day, time);
		clock.set(clock.instant().plusSeconds(extraSeconds));
	}

	private void share(Trip t) throws Exception {
		MockHttpServletResponse response = send(put("/api/driver/runs/" + t.run() + "/location-sharing")
				.with(as(Role.DRIVER, t.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"enabled\":true}"));
		assertEquals(200, response.getStatus(), response.getContentAsString());
	}

	private void fix(Trip t, double latitude) throws Exception {
		MockHttpServletResponse response = send(put("/api/driver/runs/" + t.run() + "/location")
				.with(as(Role.DRIVER, t.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"latitude\":%s,\"longitude\":%s,\"accuracyMeters\":5}".formatted(latitude, LONGITUDE)));
		assertEquals(204, response.getStatus(), response.getContentAsString());
	}

	private void choose(UUID parent, boolean late, int minutes) throws Exception {
		MockHttpServletResponse response = send(put("/api/parent/notification-preferences")
				.with(as(Role.PARENT, parent)).contentType(MediaType.APPLICATION_JSON).content(
						"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":%s,\"lateAfterMinutes\":%s}"
								.formatted(late, minutes)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
	}

	private String inbox(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get("/api/parent/inbox").with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private int lateEntries(UUID parent) throws Exception {
		return ((List<?>) JsonPath.read(inbox(parent), "$[?(@.type == 'LATE')]")).size();
	}

	// --- the threshold ------------------------------------------------------------------------

	@Test
	void aWaitingChildIsLateOnlyBeyondTheMinutesAfterThePlannedTime() throws Exception {
		Trip t = aTrip();

		at(WEDNESDAY, t.plannedFirst(), 0);
		lateAlertService.raise();
		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 0);
		lateAlertService.raise();
		assertEquals(0, lateEntries(t.parentOfFirst()), "exactly ten minutes after the plan is not beyond it");

		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 1);
		lateAlertService.raise();
		assertEquals(1, lateEntries(t.parentOfFirst()), "one second beyond");
		assertEquals(0, lateEntries(t.parentOfSecond()), "the next child's own time has not come");
		assertEquals(0, lateEntries(t.parentOfThird()));
	}

	@Test
	void theEntryIsTheInboxEntryOfTheChildAndSaysNothingMore() throws Exception {
		Trip t = aTrip();
		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 1);
		Instant now = clock.instant();

		lateAlertService.raise();

		String entries = inbox(t.parentOfFirst());
		assertEquals("LATE", JsonPath.read(entries, "$[0].type"));
		assertEquals(t.first().toString(), JsonPath.read(entries, "$[0].studentId"));
		assertEquals("Rami Nasr", JsonPath.read(entries, "$[0].studentName"));
		assertEquals(t.run(), JsonPath.read(entries, "$[0].runId"));
		assertEquals("MORNING", JsonPath.read(entries, "$[0].direction"));
		assertEquals(now, Instant.parse(JsonPath.read(entries, "$[0].createdAt")));
		assertNull(JsonPath.read(entries, "$[0].readAt"));
		Map<String, Object> entry = JsonPath.read(entries, "$[0]");
		assertEquals(Set.of("id", "type", "studentId", "studentName", "runId", "direction", "createdAt", "readAt"),
				new TreeSet<>(entry.keySet()), "no position, no estimate, no planned time, nothing about anyone else");
		Map<String, Object> sample = JsonPath.read(
				java.nio.file.Files.readString(java.nio.file.Path.of("../docs/contracts/samples/inbox/inbox-event-late.json")),
				"$");
		assertEquals(new TreeSet<>(entry.keySet()), new TreeSet<>(sample.keySet()), "the contract's sample");
		assertEquals("LATE", sample.get("type"));
		MockHttpServletResponse count = send(get("/api/parent/inbox/unread-count").with(as(Role.PARENT, t.parentOfFirst())));
		assertEquals(1, (int) JsonPath.read(count.getContentAsString(), "$.count"));
	}

	@Test
	void eachParentsOwnMinutesDecideWhenTheyAreTold() throws Exception {
		Trip t = aTrip();
		choose(t.parentOfFirst(), true, 5);
		choose(t.parentOfSecond(), true, 20);

		at(WEDNESDAY, t.plannedFirst().plusMinutes(5), 0);
		lateAlertService.raise();
		assertEquals(0, lateEntries(t.parentOfFirst()), "exactly five minutes");
		at(WEDNESDAY, t.plannedFirst().plusMinutes(5), 1);
		lateAlertService.raise();
		assertEquals(1, lateEntries(t.parentOfFirst()), "five minutes and a second");

		at(WEDNESDAY, t.plannedSecond().plusMinutes(10), 1);
		lateAlertService.raise();
		assertEquals(0, lateEntries(t.parentOfSecond()), "ten minutes is inside this parent's twenty");
		at(WEDNESDAY, t.plannedSecond().plusMinutes(20), 0);
		lateAlertService.raise();
		assertEquals(0, lateEntries(t.parentOfSecond()), "exactly twenty");
		at(WEDNESDAY, t.plannedSecond().plusMinutes(20), 1);
		lateAlertService.raise();
		assertEquals(1, lateEntries(t.parentOfSecond()), "twenty minutes and a second");
	}

	@Test
	void theBoundaryIsTheSchoolsLocalTimeInSummerAsInWinter() throws Exception {
		LocalDate july = LocalDate.of(2026, 7, 1);
		assertEquals(java.time.DayOfWeek.WEDNESDAY, july.getDayOfWeek());
		Trip t = aTripOn(july);

		at(july, t.plannedFirst().plusMinutes(10), 0);
		lateAlertService.raise();
		assertEquals(0, lateEntries(t.parentOfFirst()), "07:xx local plus ten minutes, whatever the offset from UTC");
		at(july, t.plannedFirst().plusMinutes(10), 1);
		lateAlertService.raise();
		assertEquals(1, lateEntries(t.parentOfFirst()));
	}

	// --- once ---------------------------------------------------------------------------------

	@Test
	void anAlertIsMadeOnceHoweverOftenTheJobRunsAndHoweverLateTheBusGets() throws Exception {
		Trip t = aTrip();
		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 1);

		lateAlertService.raise();
		lateAlertService.raise();
		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 60);
		lateAlertService.raise();
		at(WEDNESDAY, t.plannedFirst().plusMinutes(45), 0);
		lateAlertService.raise();

		assertEquals(1, lateEntries(t.parentOfFirst()));
		assertEquals(1, lateEntries(t.parentOfSecond()), "the next child is late by now, once");
	}

	@Test
	void aParentWhoChangesTheirMinutesAfterBeingToldIsNotToldAgain() throws Exception {
		Trip t = aTrip();
		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 1);
		lateAlertService.raise();
		assertEquals(1, lateEntries(t.parentOfFirst()));

		choose(t.parentOfFirst(), true, 60);
		lateAlertService.raise();
		choose(t.parentOfFirst(), true, 5);
		lateAlertService.raise();

		assertEquals(1, lateEntries(t.parentOfFirst()));
	}

	// --- who is told --------------------------------------------------------------------------

	@Test
	void aChildAlreadyPickedUpIsNeverLateAndTheOnesBehindThemStillCan() throws Exception {
		Trip t = aTrip();
		at(WEDNESDAY, t.plannedFirst(), 0);
		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "PICKED_UP").getStatus());

		at(WEDNESDAY, t.plannedFirst().plusMinutes(30), 0);
		lateAlertService.raise();

		assertEquals(0, lateEntries(t.parentOfFirst()), "picked up on time, so nothing to be late about");
		assertEquals(1, lateEntries(t.parentOfSecond()));
	}

	@Test
	void aChildWhoWasNotAtTheStopOrIsAbsentTodayIsNotWaiting() throws Exception {
		Trip t = aTrip();
		assertEquals(200, confirm(t.bus(), t.run(), t.first(), "NOT_PRESENT").getStatus());
		absentToday(t.parentOfSecond(), t.second());

		at(WEDNESDAY, t.plannedThird().plusMinutes(30), 0);
		lateAlertService.raise();

		assertEquals(0, lateEntries(t.parentOfFirst()));
		assertEquals(0, lateEntries(t.parentOfSecond()));
		assertEquals(1, lateEntries(t.parentOfThird()));
	}

	@Test
	void aChildWithNoLinkedParentHasNobodyToTellAndTheOthersAreStillTold() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID orphan = stopAt("Orphan", null, FIRST);
		UUID rami = stopAt("Rami", parent, SECOND);
		onRoute(bus, orphan, rami);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		LocalTime planned = plannedOf(bus, rami);

		at(WEDNESDAY, planned.plusMinutes(30), 0);
		lateAlertService.raise();

		assertEquals(1, lateEntries(parent));
	}

	@Test
	void aStopWithoutAPinHasNoPlannedTimeSoItIsNeverLate() throws Exception {
		UUID parent = aParent();
		UUID pinned = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID withoutPin = stopAt("Nopin", parent, null);
		UUID rami = stopAt("Rami", pinned, FIRST);
		onRoute(bus, rami, withoutPin);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		LocalTime planned = plannedOf(bus, rami);

		at(WEDNESDAY, planned.plusMinutes(30), 0);
		lateAlertService.raise();

		assertEquals(1, lateEntries(pinned));
		assertEquals(0, lateEntries(parent), "no pin, no planned time, nothing to be late against");
	}

	@Test
	void onlyAMorningRunInProgressIsWatched() throws Exception {
		UUID notStarted = aParent();
		UUID ended = aParent();
		UUID afternoon = aParent();
		Bus quiet = aBus("Verdun morning run");
		onRoute(quiet, stopAt("Quiet", notStarted, FIRST));
		runId(quiet, "MORNING");
		Bus done = aBus("Achrafieh morning run");
		UUID finished = stopAt("Done", ended, FIRST);
		onRoute(done, finished);
		String doneRun = runId(done, "MORNING");
		assertEquals(200, start(done, doneRun).getStatus());
		LocalTime planned = plannedOf(done, finished);
		assertEquals(200, end(done, doneRun).getStatus());
		Bus pm = aBus("Hamra afternoon run");
		onRoute(pm, stopAt("Pm", afternoon, FIRST));
		assertEquals(200, start(pm, runId(pm, "AFTERNOON")).getStatus());

		at(WEDNESDAY, planned.plusMinutes(45), 0);
		lateAlertService.raise();

		assertEquals(0, lateEntries(notStarted), "a run that has not started");
		assertEquals(0, lateEntries(ended), "a run that has ended");
		assertEquals(0, lateEntries(afternoon), "the afternoon has no planned times");
	}

	@Test
	void aDayThatBecameAHolidayHasNoAlerts() throws Exception {
		Trip t = aTrip();
		aHoliday(WEDNESDAY);

		at(WEDNESDAY, t.plannedFirst().plusMinutes(45), 0);
		lateAlertService.raise();

		assertEquals(0, lateEntries(t.parentOfFirst()));
	}

	@Test
	void aParentWhoTurnedLateAlertsOffIsNotToldUntilTheyTurnThemBackOnWhileStillLate() throws Exception {
		Trip t = aTrip();
		choose(t.parentOfFirst(), false, 10);
		at(WEDNESDAY, t.plannedFirst().plusMinutes(20), 0);
		lateAlertService.raise();
		assertEquals(0, lateEntries(t.parentOfFirst()));
		assertEquals(1, lateEntries(t.parentOfSecond()), "another parent's choices are their own");

		choose(t.parentOfFirst(), true, 10);
		at(WEDNESDAY, t.plannedFirst().plusMinutes(21), 0);
		lateAlertService.raise();

		assertEquals(1, lateEntries(t.parentOfFirst()), "told once they ask to be, while the child is still waiting");
	}

	@Test
	void everyParentSeesOnlyTheirOwnChildAndNoOtherInboxChanges() throws Exception {
		Trip t = aTrip();
		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 1);

		lateAlertService.raise();

		assertEquals(List.of(t.first().toString()), JsonPath.read(inbox(t.parentOfFirst()), "$[*].studentId"));
		assertEquals(List.of(), JsonPath.read(inbox(t.parentOfSecond()), "$[*].studentId"));
		assertEquals(List.of(), JsonPath.read(inbox(aParent()), "$[*].studentId"), "a parent with no child on the run");
	}

	// --- the live position --------------------------------------------------------------------

	@Test
	void aBusFarFromTheFirstStopMakesEveryoneBehindItLateBeforeTheClockDoes() throws Exception {
		Trip t = aTrip();
		share(t);
		at(WEDNESDAY, t.plannedFirst().minusMinutes(5), 0);
		fix(t, FAR_AWAY);

		lateAlertService.raise();

		assertEquals(1, lateEntries(t.parentOfFirst()), "expected 67 minutes after the fix, planned in 5");
		assertEquals(1, lateEntries(t.parentOfSecond()));
		assertEquals(1, lateEntries(t.parentOfThird()));
	}

	@Test
	void aBusThatIsNearAndOnTimeMakesNobodyLate() throws Exception {
		Trip t = aTrip();
		share(t);
		at(WEDNESDAY, t.plannedFirst().minusMinutes(1), 0);
		fix(t, BEFORE_FIRST);

		lateAlertService.raise();

		assertEquals(0, lateEntries(t.parentOfFirst()));
		assertEquals(0, lateEntries(t.parentOfSecond()));
		assertEquals(0, lateEntries(t.parentOfThird()));
	}

	@Test
	void aMissingPositionIsNotADelayButTheClockStillIs() throws Exception {
		Trip t = aTrip();
		// Sharing is on and no position has arrived yet.
		share(t);

		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 0);
		lateAlertService.raise();
		assertEquals(0, lateEntries(t.parentOfFirst()), "no position says nothing about being late");

		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 1);
		lateAlertService.raise();
		assertEquals(1, lateEntries(t.parentOfFirst()), "but the planned time plus ten minutes has passed");
	}

	@Test
	void aStalePositionIsNotADelayEitherAndMakesNoEstimate() throws Exception {
		Trip t = aTrip();
		share(t);
		// A fix from far away, which would make everyone late if it were still live, now 61 seconds old.
		at(WEDNESDAY, t.plannedFirst().minusMinutes(5), 0);
		fix(t, FAR_AWAY);
		clock.set(clock.instant().plusSeconds(61));

		lateAlertService.raise();

		assertEquals(0, lateEntries(t.parentOfFirst()), "stale: the last place is known but no time is made from it");
		assertEquals(0, lateEntries(t.parentOfSecond()));
		assertEquals(0, lateEntries(t.parentOfThird()));

		at(WEDNESDAY, t.plannedFirst().plusMinutes(10), 1);
		lateAlertService.raise();
		assertEquals(1, lateEntries(t.parentOfFirst()), "the clock, not the old position, makes it late");
	}

	@Test
	void aLiveEstimateExactlyAtTheThresholdIsNotLate() throws Exception {
		Trip t = aTrip();
		share(t);
		// The first stop is 3 minutes from here: expected at the fix time plus 3 minutes.
		at(WEDNESDAY, t.plannedFirst().plusMinutes(7), 0);
		fix(t, BEFORE_FIRST);

		lateAlertService.raise();
		assertEquals(0, lateEntries(t.parentOfFirst()), "planned + 10:00 exactly");

		at(WEDNESDAY, t.plannedFirst().plusMinutes(7), 1);
		fix(t, BEFORE_FIRST);
		lateAlertService.raise();
		assertEquals(1, lateEntries(t.parentOfFirst()), "planned + 10:01");
	}
}
