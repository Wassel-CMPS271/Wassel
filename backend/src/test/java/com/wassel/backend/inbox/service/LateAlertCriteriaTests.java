package com.wassel.backend.inbox.service;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.common.config.ClockConfig;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.lang.reflect.Method;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-266: independent tests of the late alerts (SCRUM-268), from the "Late alerts" and "Notification preferences"
 * sections of {@code docs/contracts/inbox.md} on PR #158's branch and {@code runs.md}'s "Live ETA and stop progress" (PR
 * #153), never from {@code LateAlertTests}, {@code LateAlertRetryTests}, {@code LateRuleTests} or the service code.
 *
 * <p>PENDING MERGE of SCRUM-268 (PR #158, on top of #153). No compile-time reference to anything that only exists there; the
 * class switches itself on through {@link com.wassel.backend.common.Scrum268Gate} when #158's classes are on the classpath. Run it earlier on a branch with #158 merged, or
 * with {@code -Dpending.SCRUM-268=true} (on plain {@code develop} every test then fails, which shows they can fail). Delete
 * the gate and the {@code @EnabledIf} line once #158 is merged.
 *
 * <p><b>Independence limit.</b> The late job runs about once a minute in production and has no HTTP trigger, so these
 * tests ask the application context for the bean {@code com.wassel.backend.inbox.service.LateAlertService} (named in the
 * PR's description, not read from code) and call its no-argument {@code raise} method. Once the suite is on, a missing
 * class, bean or method fails the test instead of skipping it. Everything else goes through HTTP. The planned time is
 * read from the parent's own {@code GET .../bus-location} ({@code plannedTime}), never computed here, and the boundary
 * tests use no position, so the estimate's arithmetic is not under test (that is SCRUM-272's).
 */
@EnabledIf(value = "com.wassel.backend.common.Scrum268Gate#built", disabledReason = "PENDING MERGE: SCRUM-268 (PR #158). Run with -Dpending.SCRUM-268=true")
class LateAlertCriteriaTests extends RunCriteriaSupport {

	private static final String SERVICE = "com.wassel.backend.inbox.service.LateAlertService";

	private static final String PREFERENCES = "/api/parent/notification-preferences";

	private static final Set<String> KEYS = Set.of("id", "type", "studentId", "studentName", "runId", "direction",
			"createdAt", "readAt");

	@Autowired
	private ApplicationContext context;

	/** The job, run once, now. Fails (never skips) if the class, the bean or the method is not there. */
	private void runLateCheck() {
		try {
			Class<?> type = Class.forName(SERVICE);
			Method raise = type.getMethod("raise");
			raise.invoke(context.getBean(type));
		}
		catch (ReflectiveOperationException | RuntimeException e) {
			throw new AssertionError("The late job could not be run through " + SERVICE + ".raise(): " + e, e);
		}
	}

	private static <T> List<T> inParallel(List<Callable<T>> calls) throws Exception {
		// TODO: use common.Parallel once #156 moves inParallel there
		ExecutorService pool = Executors.newFixedThreadPool(calls.size());
		try {
			CyclicBarrier gate = new CyclicBarrier(calls.size());
			List<Future<T>> pending = new ArrayList<>();
			for (Callable<T> call : calls) {
				pending.add(pool.submit(() -> {
					gate.await();
					return call.call();
				}));
			}
			List<T> answers = new ArrayList<>();
			for (Future<T> answer : pending) {
				answers.add(answer.get(60, TimeUnit.SECONDS));
			}
			return answers;
		}
		finally {
			pool.shutdownNow();
			if (!pool.awaitTermination(10, TimeUnit.SECONDS)) {
				throw new AssertionError("a worker is still running after its test: " + pool);
			}
		}
	}

	/** One parent, one child and a morning run the driver has started; {@code planned} is what the parent's own screen shows. */
	private record Scene(UUID parent, Bus bus, UUID child, String run, LocalTime planned) {
	}

	private Scene aWaitingChild() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID child = aStudent("Tarek", parent);
		onRoute(bus, child);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		return new Scene(parent, bus, child, run, plannedTime(parent, child));
	}

	private String busLocation(UUID parent, UUID child) throws Exception {
		MockHttpServletResponse response = send(get("/api/parent/children/" + child + "/bus-location")
				.with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private LocalTime plannedTime(UUID parent, UUID child) throws Exception {
		String planned = JsonPath.read(busLocation(parent, child), "$.plannedTime");
		assertNotNull(planned, "the child must be waiting on a started morning run and have a planned time");
		return LocalTime.parse(planned);
	}

	private void savePreferences(UUID parent, boolean late, int minutes) throws Exception {
		MockHttpServletResponse response = send(put(PREFERENCES).with(as(Role.PARENT, parent))
				.contentType(MediaType.APPLICATION_JSON).content(
						"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":%s,\"lateAfterMinutes\":%d}"
								.formatted(late, minutes)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
	}

	private String inbox(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get("/api/parent/inbox").with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private List<Map<String, Object>> lateEntries(UUID parent) throws Exception {
		return JsonPath.read(inbox(parent), "$[?(@.type == 'LATE')]");
	}

	/** Moves the clock to the planned time plus minutes and seconds, today (Wednesday). */
	private void at(Scene scene, int minutes, int seconds) {
		setNow(WEDNESDAY, scene.planned().plusMinutes(minutes).plusSeconds(seconds));
	}

	// ---------------------------------------------------------------- the threshold: under, at, over

	/**
	 * Contract: "Late means the expected time is after the planned time plus the parent's lateAfterMinutes. Exactly that many
	 * minutes later is not late; one second more is." With no position, the expected time is the moment of the check.
	 */
	@Test
	void withTheDefaultTenMinutesOneSecondUnderAndExactlyAtTheLimitIsNotLateAndOneSecondOverIs() throws Exception {
		Scene scene = aWaitingChild();

		at(scene, 9, 59);
		runLateCheck();
		assertEquals(0, lateEntries(scene.parent()).size(), "9:59 after planned");
		at(scene, 10, 0);
		runLateCheck();
		assertEquals(0, lateEntries(scene.parent()).size(), "exactly 10:00 after planned is not late");
		at(scene, 10, 1);
		runLateCheck();

		List<Map<String, Object>> late = lateEntries(scene.parent());
		assertEquals(1, late.size(), "10:01 after planned is late");
		Map<String, Object> entry = late.get(0);
		assertEquals(KEYS, entry.keySet(), "nothing but what every entry carries: no position, estimate or planned time");
		assertEquals("LATE", entry.get("type"));
		assertEquals(scene.child().toString(), entry.get("studentId"));
		assertEquals("Tarek Nasr", entry.get("studentName"));
		assertEquals(scene.run(), entry.get("runId"));
		assertEquals("MORNING", entry.get("direction"));
		assertNull(entry.get("readAt"));
		assertEquals(clock.instant(), Instant.parse((String) entry.get("createdAt")), "the moment the alert was made");
	}

	/** Contract: the same rule at the shortest and the longest setting. */
	@Test
	void theLimitFollowsTheParentsMinutesAtFiveAndAtSixty() throws Exception {
		for (int minutes : List.of(5, 60)) {
			clock.set(WEDNESDAY_7AM);
			Scene scene = aWaitingChild();
			savePreferences(scene.parent(), true, minutes);

			at(scene, minutes, 0);
			runLateCheck();
			assertEquals(0, lateEntries(scene.parent()).size(), "exactly " + minutes + ":00");
			at(scene, minutes, 1);
			runLateCheck();

			assertEquals(1, lateEntries(scene.parent()).size(), minutes + ":01");
		}
	}

	// ---------------------------------------------------------------- the live position

	/**
	 * Contract: with a LIVE position the expected time is the live estimate, "so a bus far from the stop makes the child late
	 * before the clock does". A fix far north of Beirut puts the estimate hours after planned + 10, while the clock is still
	 * before the planned time.
	 */
	@Test
	void aBusFarFromTheStopMakesTheChildLateBeforeTheClockDoes() throws Exception {
		Scene scene = aWaitingChild();
		shareFix(scene, 34.9, 35.9);
		String location = busLocation(scene.parent(), scene.child());
		assertEquals("LIVE", JsonPath.read(location, "$.status"));
		Instant arrivesAt = Instant.parse(JsonPath.read(location, "$.estimate.arrivesAt"));
		Instant lateAfter = WEDNESDAY.atTime(scene.planned()).atZone(ClockConfig.SCHOOL_ZONE).toInstant().plusSeconds(600);
		assertTrue(arrivesAt.isAfter(lateAfter), "the setup is meaningful: the estimate " + arrivesAt + " is after " + lateAfter);
		assertTrue(clock.instant().isBefore(lateAfter), "and the clock is still before the limit");

		runLateCheck();

		assertEquals(1, lateEntries(scene.parent()).size());
	}

	/** Contract: "A stale or missing position is never a delay by itself" (the same far fix, now 61 seconds old). */
	@Test
	void aStalePositionIsNeverADelayByItself() throws Exception {
		Scene scene = aWaitingChild();
		shareFix(scene, 34.9, 35.9);
		clock.set(clock.instant().plusSeconds(61));
		assertEquals("STALE", JsonPath.read(busLocation(scene.parent(), scene.child()), "$.status"));

		runLateCheck();

		assertEquals(0, lateEntries(scene.parent()).size());
	}

	/** The driver opts in and sends one fix; the clock does not move. */
	private void shareFix(Scene scene, double latitude, double longitude) throws Exception {
		MockHttpServletResponse sharing = send(put("/api/driver/runs/" + scene.run() + "/location-sharing")
				.with(as(Role.DRIVER, scene.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"enabled\":true}"));
		assertEquals(200, sharing.getStatus(), sharing.getContentAsString());
		MockHttpServletResponse fix = send(put("/api/driver/runs/" + scene.run() + "/location")
				.with(as(Role.DRIVER, scene.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"latitude\":%s,\"longitude\":%s,\"accuracyMeters\":10}".formatted(latitude, longitude)));
		assertEquals(204, fix.getStatus(), fix.getContentAsString());
	}

	/** Contract: LIVE is up to 60 seconds old, STALE after that; a fix exactly 60 seconds old is still LIVE, 61 is not. */
	@Test
	void aFixSixtySecondsOldIsStillLiveAndSixtyOneIsStale() throws Exception {
		Scene scene = aWaitingChild();
		shareFix(scene, 34.9, 35.9);

		clock.set(clock.instant().plusSeconds(60));
		assertEquals("LIVE", JsonPath.read(busLocation(scene.parent(), scene.child()), "$.status"), "60 s");
		runLateCheck();
		assertEquals(1, lateEntries(scene.parent()).size(), "a 60-second-old fix still counts");

		Scene other = aWaitingChild();
		shareFix(other, 34.9, 35.9);
		clock.set(clock.instant().plusSeconds(61));
		assertEquals("STALE", JsonPath.read(busLocation(other.parent(), other.child()), "$.status"), "61 s");
		runLateCheck();
		assertEquals(0, lateEntries(other.parent()).size(), "a 61-second-old fix is never a delay by itself");
	}

	/**
	 * Contract: with a LIVE position the expected time is the live estimate; a bus on time makes no alert (the converse of the
	 * far fix above). A fix at the child's own pin puts the estimate at about now, before planned + 10 minutes.
	 */
	@Test
	void aLiveFixWhoseEstimateIsBeforeThePlannedTimePlusTheLimitMakesNoAlert() throws Exception {
		Scene scene = aWaitingChild();
		Student child = studentRepository.findById(scene.child()).orElseThrow();
		shareFix(scene, child.getLatitude().doubleValue(), child.getLongitude().doubleValue());
		String location = busLocation(scene.parent(), scene.child());
		assertEquals("LIVE", JsonPath.read(location, "$.status"));
		Instant arrivesAt = Instant.parse(JsonPath.read(location, "$.estimate.arrivesAt"));
		Instant lateAfter = WEDNESDAY.atTime(scene.planned()).atZone(ClockConfig.SCHOOL_ZONE).toInstant().plusSeconds(600);
		assertTrue(arrivesAt.isBefore(lateAfter), "the setup is meaningful: the estimate " + arrivesAt + " is before " + lateAfter);

		runLateCheck();

		assertEquals(0, lateEntries(scene.parent()).size());
	}

	// ---------------------------------------------------------------- once

	/**
	 * Contract: "at most one LATE entry per run and child, however often the job runs", also at the same instant. The very
	 * first late check of each scene is the two parallel calls, so they race to make the first entry (five rounds, each in a
	 * fresh scene): a missing unique key or a check-then-insert would make two.
	 */
	@Test
	void twoJobRunsAtTheSameInstantRacingToMakeTheFirstEntryMakeOneEntry() throws Exception {
		for (int round = 1; round <= 5; round++) {
			Scene scene = aWaitingChild();
			at(scene, 10, 1);
			assertEquals(0, lateEntries(scene.parent()).size(), "round " + round + ": nothing yet, so the race is for the first");

			inParallel(List.<Callable<Object>>of(() -> {
				runLateCheck();
				return null;
			}, () -> {
				runLateCheck();
				return null;
			}));

			assertEquals(1, lateEntries(scene.parent()).size(), "round " + round);
		}
	}

	/** Contract: the same, one run after another, and again much later. */
	@Test
	void theJobRunThreeTimesInARowAndAgainMuchLaterStillMakesOneEntry() throws Exception {
		Scene scene = aWaitingChild();
		at(scene, 10, 1);

		runLateCheck();
		runLateCheck();
		runLateCheck();
		assertEquals(1, lateEntries(scene.parent()).size());
		at(scene, 20, 0);
		runLateCheck();

		assertEquals(1, lateEntries(scene.parent()).size());
	}

	/** Contract: the parent changing their minutes afterwards makes no second entry, and a later pickup does not withdraw it. */
	@Test
	void changingTheMinutesAfterwardsAndAPickupLeaveTheOneEntryInPlace() throws Exception {
		Scene scene = aWaitingChild();
		at(scene, 10, 1);
		runLateCheck();
		assertEquals(1, lateEntries(scene.parent()).size());

		savePreferences(scene.parent(), true, 5);
		runLateCheck();
		savePreferences(scene.parent(), true, 60);
		runLateCheck();
		savePreferences(scene.parent(), true, 10);
		runLateCheck();
		assertEquals(1, lateEntries(scene.parent()).size(), "no second entry for any minutes");
		MockHttpServletResponse pickedUp = confirm(scene.bus(), scene.run(), scene.child(), "PICKED_UP");
		assertEquals(200, pickedUp.getStatus());

		assertEquals(1, lateEntries(scene.parent()).size(), "the alert is not withdrawn");
		assertEquals(Set.of("LATE", "PICKED_UP"), Set.copyOf(JsonPath.<List<String>>read(inbox(scene.parent()), "$[*].type")));
	}

	// ---------------------------------------------------------------- never late

	/** Contract: only a child still waiting on a morning run in progress. A run that has not started is not watched. */
	@Test
	void aMorningRunThatHasNotStartedMakesNoAlert() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID child = aStudent("Tarek", parent);
		onRoute(bus, child);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		LocalTime planned = plannedTime(parent, child);
		Bus other = aBus("Second run");
		UUID otherParent = aParent();
		UUID otherChild = aStudent("Rana", otherParent);
		onRoute(other, otherChild);
		runId(other, "MORNING");
		UUID idle = aStudent("Idle", parent);
		Bus idleBus = aBus("Third run");
		onRoute(idleBus, idle);
		runId(idleBus, "MORNING");

		setNow(WEDNESDAY, planned.plusMinutes(30));
		runLateCheck();

		List<Map<String, Object>> late = lateEntries(parent);
		assertEquals(1, late.size(), "only the child on the started run");
		assertEquals(child.toString(), late.get(0).get("studentId"), "not the sibling whose run never started");
		assertEquals(0, lateEntries(otherParent).size(), "nor a child on another route whose run never started");
	}

	/** Contract: it does not look at runs that have ended. */
	@Test
	void aRunThatHasEndedMakesNoAlert() throws Exception {
		Scene scene = aWaitingChild();
		assertEquals(200, end(scene.bus(), scene.run()).getStatus());

		at(scene, 30, 0);
		runLateCheck();

		assertEquals(0, lateEntries(scene.parent()).size());
	}

	/** Contract: it does not look at the afternoon, which has no planned times. */
	@Test
	void anAfternoonRunMakesNoAlert() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID child = aStudent("Tarek", parent);
		onRoute(bus, child);
		String afternoon = runId(bus, "AFTERNOON");
		assertEquals(200, start(bus, afternoon).getStatus());

		setNow(WEDNESDAY, LocalTime.of(15, 0));
		runLateCheck();

		assertEquals(0, lateEntries(parent).size());
	}

	/** Contract: a child with an absence reported for today is not watched. */
	@Test
	void aChildAbsentTodayMakesNoAlert() throws Exception {
		Scene scene = aWaitingChild();
		absentToday(scene.parent(), scene.child());

		at(scene, 30, 0);
		runLateCheck();

		assertEquals(0, lateEntries(scene.parent()).size());
	}

	/** Contract: "not yet picked up or marked not present": a picked-up child and a not-present child are never late. */
	@Test
	void aPickedUpChildAndANotPresentChildMakeNoAlert() throws Exception {
		Scene scene = aWaitingChild();
		UUID absent = aStudent("Rana", scene.parent());
		onRoute(scene.bus(), absent);
		assertEquals(200, confirm(scene.bus(), scene.run(), scene.child(), "PICKED_UP").getStatus());
		assertEquals(200, confirm(scene.bus(), scene.run(), absent, "NOT_PRESENT").getStatus());

		at(scene, 30, 0);
		runLateCheck();

		assertEquals(0, lateEntries(scene.parent()).size());
	}

	/** Contract: "A stop with no planned time (no pin, or no schedule) is never late." */
	@Test
	void aStopWithNoPlannedTimeIsNeverLate() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID pinned = aStudent("Pinned", null);
		Student unpinned = studentRepository.save(Student.builder().schoolId(school).firstName("Nopin").lastName("Nasr")
				.grade("4").guardianName("Guardian").guardianPhone("+961 3 600 600").status(StudentStatus.ACTIVE)
				.address("Somewhere with no pin").parentUserId(parent).build());
		onRoute(bus, pinned, unpinned.getId());
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		assertNull(JsonPath.<String>read(busLocation(parent, unpinned.getId()), "$.plannedTime"),
				"the setup is meaningful: this stop has no planned time");

		setNow(WEDNESDAY, LocalTime.of(10, 0));
		runLateCheck();

		assertEquals(0, lateEntries(parent).size());
	}

	/** Contract: it does not look at a holiday. The holiday is added after the run exists (runs.md: it hides the runs). */
	@Test
	void aHolidayMakesNoAlert() throws Exception {
		Scene scene = aWaitingChild();
		aHoliday(WEDNESDAY);

		at(scene, 30, 0);
		runLateCheck();

		assertEquals(0, lateEntries(scene.parent()).size());
	}

	// ---------------------------------------------------------------- who is told

	/**
	 * Contract: a parent with late alerts off is not told, and is told at the next check when they turn them on while the child
	 * is still late; only the linked parent gets it; a child with no linked parent makes none.
	 */
	@Test
	void lateAlertsOffMakeNoEntryUntilTurnedBackOnAndOnlyTheLinkedParentIsTold() throws Exception {
		UUID off = aParent();
		UUID on = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID offChild = aStudent("Tarek", off);
		UUID onChild = aStudent("Rana", on);
		UUID unlinked = aStudent("Nobody", null);
		onRoute(bus, offChild, onChild, unlinked);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		LocalTime planned = plannedTime(off, offChild);
		savePreferences(off, false, 10);
		setNow(WEDNESDAY, planned.plusMinutes(30));

		runLateCheck();

		assertEquals(0, lateEntries(off).size(), "late alerts are off");
		List<Map<String, Object>> told = lateEntries(on);
		assertEquals(1, told.size());
		assertEquals(onChild.toString(), told.get(0).get("studentId"), "the other parent hears only about their own child");
		savePreferences(off, true, 10);
		runLateCheck();
		List<Map<String, Object>> later = lateEntries(off);
		assertEquals(1, later.size(), "told at the next check after turning alerts on while still late");
		assertEquals(offChild.toString(), later.get(0).get("studentId"));
		runLateCheck();
		assertEquals(1, lateEntries(off).size());
		assertEquals(1, lateEntries(on).size(), "the other parent still has one, not two");
	}

	// ---------------------------------------------------------------- school-local time, in summer

	/** Contract: "School-local means the school's time zone (Asia/Beirut, summer and winter), not UTC." Summer is UTC+3. */
	@Test
	void onASummerSchoolDayThePlannedTimeIsSchoolLocalAndTheLimitIsExact() throws Exception {
		LocalDate summerWednesday = LocalDate.of(2027, 6, 2);
		setNow(summerWednesday, LocalTime.of(7, 0));
		Scene scene = aWaitingChild();

		setNow(summerWednesday, scene.planned().plusMinutes(10));
		runLateCheck();
		assertEquals(0, lateEntries(scene.parent()).size(), "exactly 10:00 after planned");
		setNow(summerWednesday, scene.planned().plusMinutes(10).plusSeconds(1));
		runLateCheck();

		List<Map<String, Object>> late = lateEntries(scene.parent());
		assertEquals(1, late.size());
		Instant expected = summerWednesday.atTime(scene.planned().plusMinutes(10).plusSeconds(1))
				.atZone(ClockConfig.SCHOOL_ZONE).toInstant();
		assertEquals(expected, Instant.parse((String) late.get(0).get("createdAt")));
		assertEquals(3, ClockConfig.SCHOOL_ZONE.getRules().getOffset(expected).getTotalSeconds() / 3600, "UTC+3 in June");
	}
}
