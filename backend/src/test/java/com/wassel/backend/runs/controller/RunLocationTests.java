package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.common.WhileLocked;
import com.wassel.backend.runs.entity.RunLocation;
import com.wassel.backend.runs.repository.RunLocationRepository;
import com.wassel.backend.runs.repository.RunRepository;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-261: the driver's live position (docs/contracts/runs.md "Live location"). Real app, real repositories, the
 * PostgreSQL container and every Flyway migration. Everything goes through the HTTP API except what has no endpoint
 * (another driver's consent, the retention clean-up).
 */
class RunLocationTests extends RunCriteriaSupport {

	private static final String SAMPLES = "../docs/contracts/samples/runs/";

	private static final String MORNING = "MORNING";

	@Autowired
	private RunLocationRepository locations;

	@Autowired
	private RunRepository runs;

	@Autowired
	private TransactionTemplate transactionTemplate;

	/** A route of two children (the parent's first), its morning run in progress at 07:00. */
	private record Morning(Bus bus, String run, UUID parent, UUID child) {
	}

	private Morning aMorningInProgress() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID child = aStudent("Dana", parent);
		onRoute(bus, child, aStudent("Omar", null));
		String run = runId(bus, MORNING);
		assertEquals(200, start(bus, run).getStatus());
		return new Morning(bus, run, parent, child);
	}

	private MockHttpServletResponse share(Bus bus, String run, boolean enabled) throws Exception {
		return send(put("/api/driver/runs/" + run + "/location-sharing").with(as(Role.DRIVER, bus.driverUserId()))
				.contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":" + enabled + "}"));
	}

	private MockHttpServletResponse position(Bus bus, String run, String body) throws Exception {
		return send(put("/api/driver/runs/" + run + "/location").with(as(Role.DRIVER, bus.driverUserId()))
				.contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private MockHttpServletResponse position(Bus bus, String run) throws Exception {
		return position(bus, run, "{\"latitude\":33.8961,\"longitude\":35.4823,\"accuracyMeters\":12.5}");
	}

	private MockHttpServletResponse busLocation(UUID parent, UUID child) throws Exception {
		return send(get("/api/parent/children/" + child + "/bus-location").with(as(Role.PARENT, parent)));
	}

	private String parentSees(Morning m) throws Exception {
		MockHttpServletResponse response = busLocation(m.parent(), m.child());
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return JsonPath.read(response.getContentAsString(), "$.status");
	}

	private MockHttpServletResponse headLocations(UUID schoolId) throws Exception {
		return send(get(HEAD_RUNS + "/locations").with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), schoolId)));
	}

	private static String headStatus(String body, String runId) {
		List<String> status = JsonPath.read(body, "$[?(@.runId == '" + runId + "')].status");
		return status.get(0);
	}

	private static boolean sharingOf(String day, String runId) {
		List<Boolean> sharing = JsonPath.read(day, "$.runs[?(@.id == '" + runId + "')].locationSharing");
		return sharing.get(0);
	}

	private Morning sharing() throws Exception {
		Morning m = aMorningInProgress();
		assertEquals(200, share(m.bus(), m.run(), true).getStatus());
		assertEquals(204, position(m.bus(), m.run()).getStatus());
		return m;
	}

	// ---------------------------------------------------------------- who may send

	@Test
	void anotherRoleIsForbiddenAndASignedOutCallerIsUnauthorized() throws Exception {
		Morning m = aMorningInProgress();
		for (Role role : List.of(Role.PARENT, Role.HEAD_OF_TRANSPORT, Role.ADMIN)) {
			assertEquals(403, send(put("/api/driver/runs/" + m.run() + "/location-sharing").with(as(role, UUID.randomUUID()))
					.contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}")).getStatus(), role.name());
			assertEquals(403, send(put("/api/driver/runs/" + m.run() + "/location").with(as(role, UUID.randomUUID()))
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"latitude\":1,\"longitude\":1,\"accuracyMeters\":1}")).getStatus(), role.name());
		}
		assertEquals(401, send(put("/api/driver/runs/" + m.run() + "/location")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"latitude\":1,\"longitude\":1,\"accuracyMeters\":1}")).getStatus());
	}

	@Test
	void aRunThatIsNotTheDriversIsNotFoundForSharingAndForPositions() throws Exception {
		Morning m = aMorningInProgress();
		Bus other = aBus("Verdun morning run");
		MockHttpServletRequestBuilder otherSchool = put("/api/driver/runs/" + m.run() + "/location")
				.with(as(Role.DRIVER, m.bus().driverUserId(), UUID.randomUUID()))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"latitude\":1,\"longitude\":1,\"accuracyMeters\":1}");

		assertEquals(404, share(other, m.run(), true).getStatus(), "another driver's run");
		assertEquals(404, position(other, m.run()).getStatus());
		assertEquals(404, share(m.bus(), UUID.randomUUID().toString(), true).getStatus(), "an unknown run");
		assertEquals(404, position(m.bus(), UUID.randomUUID().toString()).getStatus());
		assertEquals(404, send(otherSchool).getStatus(), "a driver of another school");
		assertFalse(sharingOf(driverToday(m.bus()), m.run()));
	}

	@Test
	void aRunHiddenByAHolidayIsNotFound() throws Exception {
		Morning m = sharing();

		aHoliday(WEDNESDAY);
		assertEquals(404, position(m.bus(), m.run()).getStatus());
		assertEquals(404, share(m.bus(), m.run(), false).getStatus());
	}

	@Test
	void aRunFromYesterdayCannotTakePositionsAfterMidnight() throws Exception {
		Morning m = sharing();

		setNow(WEDNESDAY.plusDays(1), LocalTime.of(7, 0));

		assertEquals(404, position(m.bus(), m.run()).getStatus());
	}

	// ---------------------------------------------------------------- consent

	@Test
	void aPositionNeedsTheRunInProgressAndTheDriversConsent() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, aStudent("Dana", null));
		String run = runId(bus, MORNING);

		assertEquals(409, share(bus, run, true).getStatus(), "opt in before the run starts");
		assertEquals(409, position(bus, run).getStatus(), "a position before the run starts");
		assertEquals(200, share(bus, run, false).getStatus(), "withdrawing is allowed before the start");
		assertEquals("NOT_STARTED", JsonPath.read(share(bus, run, false).getContentAsString(), "$.state"));

		start(bus, run);
		MockHttpServletResponse noConsent = position(bus, run);
		assertEquals(409, noConsent.getStatus());
		assertEquals("Location sharing is off for this run", JsonPath.read(noConsent.getContentAsString(), "$.detail"));
	}

	@Test
	void optingInShowsOnTheRunAndWithdrawingStopsEverything() throws Exception {
		Morning m = aMorningInProgress();

		MockHttpServletResponse on = share(m.bus(), m.run(), true);
		assertEquals(200, on.getStatus(), on.getContentAsString());
		assertTrue(JsonPath.<Boolean>read(on.getContentAsString(), "$.locationSharing"));
		assertEquals(200, share(m.bus(), m.run(), true).getStatus(), "opting in twice changes nothing");
		assertEquals(204, position(m.bus(), m.run()).getStatus());
		assertEquals("LIVE", parentSees(m));
		assertEquals(200, share(m.bus(), m.run(), true).getStatus());
		assertEquals("LIVE", parentSees(m), "a retried opt-in while sharing keeps the position");

		MockHttpServletResponse off = share(m.bus(), m.run(), false);
		assertFalse(JsonPath.<Boolean>read(off.getContentAsString(), "$.locationSharing"));
		assertEquals(200, share(m.bus(), m.run(), false).getStatus(), "withdrawing twice changes nothing");
		assertEquals("UNAVAILABLE", parentSees(m));
		assertEquals(409, position(m.bus(), m.run()).getStatus(), "a late position after the withdrawal");
		assertEquals("UNAVAILABLE", parentSees(m), "and it did not bring the position back");

		share(m.bus(), m.run(), true);
		assertEquals("UNAVAILABLE", parentSees(m), "a new opt-in starts with no position");
	}

	@Test
	void endingTheRunWithdrawsConsentAndRemovesThePosition() throws Exception {
		Morning m = sharing();

		assertEquals(200, end(m.bus(), m.run()).getStatus());

		RunLocation stored = locations.findById(UUID.fromString(m.run())).orElseThrow();
		assertFalse(stored.isSharing());
		assertNull(stored.getLatitude());
		assertNull(stored.getReceivedAt());
		MockHttpServletResponse after = position(m.bus(), m.run());
		assertEquals(409, after.getStatus());
		assertTrue(JsonPath.<String>read(after.getContentAsString(), "$.detail").contains("FINISHED"));
		assertEquals(409, share(m.bus(), m.run(), true).getStatus(), "no opt-in on a finished run");
		assertEquals(200, share(m.bus(), m.run(), false).getStatus(), "withdrawing after the end is harmless");
		assertEquals("UNAVAILABLE", parentSees(m));
		assertFalse(sharingOf(driverToday(m.bus()), m.run()));
		assertEquals("[]", headLocations(school).getContentAsString(), "a finished run leaves the live list");
	}

	@Test
	void anotherDriversConsentIsNotThisDriversConsent() throws Exception {
		Morning m = aMorningInProgress();
		transactionTemplate.executeWithoutResult(tx ->
				locations.startSharing(school, UUID.fromString(m.run()), UUID.randomUUID()));

		assertEquals(409, position(m.bus(), m.run()).getStatus());
	}

	@Test
	void optingInWaitsForTheRunLockSoItCannotOutliveTheEnd() throws Exception {
		Morning m = aMorningInProgress();
		UUID run = UUID.fromString(m.run());

		MockHttpServletResponse answer = WhileLocked.send(transactionTemplate, () -> {
			runs.findLockedBySchoolIdAndId(school, run);
			runs.markEnded(school, run, Instant.now());
		}, () -> share(m.bus(), m.run(), true));

		assertEquals(409, answer.getStatus());
		assertTrue(locations.findById(run).isEmpty(), "no consent was recorded for the finished run");
	}

	// ---------------------------------------------------------------- validation

	@Test
	void coordinatesOutOfRangeOrMissingAreRejectedAndNeverStored() throws Exception {
		Morning m = aMorningInProgress();
		share(m.bus(), m.run(), true);

		record Bad(String body, String field) {
		}
		for (Bad bad : List.of(
				new Bad("{\"latitude\":90.1,\"longitude\":35,\"accuracyMeters\":1}", "latitude"),
				new Bad("{\"latitude\":-91,\"longitude\":35,\"accuracyMeters\":1}", "latitude"),
				new Bad("{\"latitude\":33,\"longitude\":180.5,\"accuracyMeters\":1}", "longitude"),
				new Bad("{\"latitude\":33,\"longitude\":-181,\"accuracyMeters\":1}", "longitude"),
				new Bad("{\"latitude\":33,\"longitude\":35,\"accuracyMeters\":-1}", "accuracyMeters"),
				new Bad("{\"latitude\":33,\"longitude\":35,\"accuracyMeters\":10001}", "accuracyMeters"),
				new Bad("{\"longitude\":35,\"accuracyMeters\":1}", "latitude"),
				new Bad("{\"latitude\":33,\"accuracyMeters\":1}", "longitude"),
				new Bad("{\"latitude\":33,\"longitude\":35}", "accuracyMeters"),
				new Bad("{\"latitude\":1e999,\"longitude\":35,\"accuracyMeters\":1}", "latitude"))) {
			MockHttpServletResponse answer = position(m.bus(), m.run(), bad.body());
			assertEquals(400, answer.getStatus(), bad.body());
			assertNotNull(JsonPath.read(answer.getContentAsString(), "$.errors." + bad.field()), bad.body());
		}
		assertEquals(400, position(m.bus(), m.run(), "not json").getStatus());
		assertEquals("UNAVAILABLE", parentSees(m), "nothing was stored");
	}

	@Test
	void sharingWithoutEnabledIsABadRequest() throws Exception {
		Morning m = aMorningInProgress();

		assertEquals(400, send(put("/api/driver/runs/" + m.run() + "/location-sharing")
				.with(as(Role.DRIVER, m.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content("{}")).getStatus());
	}

	// ---------------------------------------------------------------- freshness

	@Test
	void aPositionIsLiveThenStaleThenGone() throws Exception {
		Morning m = sharing();
		Instant sent = clock.instant();

		clock.set(sent.plusSeconds(60));
		assertEquals("LIVE", parentSees(m));
		clock.set(sent.plusSeconds(61));
		MockHttpServletResponse at61 = busLocation(m.parent(), m.child());
		assertEquals("STALE", JsonPath.read(at61.getContentAsString(), "$.status"));
		assertEquals(61, JsonPath.<Integer>read(at61.getContentAsString(), "$.position.ageSeconds"));
		assertEquals("STALE", headStatus(headLocations(school).getContentAsString(), m.run()));
		clock.set(sent.plusSeconds(300));
		assertEquals("STALE", parentSees(m));
		clock.set(sent.plusSeconds(301));
		MockHttpServletResponse gone = busLocation(m.parent(), m.child());
		assertEquals("UNAVAILABLE", JsonPath.read(gone.getContentAsString(), "$.status"));
		assertNull(JsonPath.read(gone.getContentAsString(), "$.position"));
		assertEquals("UNAVAILABLE", headStatus(headLocations(school).getContentAsString(), m.run()));
	}

	@Test
	void theCleanUpRemovesOnlyPositionsPastTheLimit() throws Exception {
		Morning m = sharing();
		UUID run = UUID.fromString(m.run());
		Instant sent = locations.findById(run).orElseThrow().getReceivedAt();

		transactionTemplate.executeWithoutResult(tx ->
				locations.clearReceivedBefore(sent.minus(RunLocation.SHOWN_FOR).plusSeconds(1)));
		assertEquals(sent, locations.findById(run).orElseThrow().getReceivedAt(), "a fresh position stays");

		transactionTemplate.executeWithoutResult(tx -> locations.clearReceivedBefore(sent.plusSeconds(1)));
		RunLocation cleared = locations.findById(run).orElseThrow();
		assertNull(cleared.getReceivedAt());
		assertNull(cleared.getLongitude());
		assertTrue(cleared.isSharing(), "the consent is the driver's to withdraw");
	}

	// ---------------------------------------------------------------- the parent

	@Test
	void aParentSeesOnlyTheirOwnChildsBus() throws Exception {
		Morning m = sharing();
		UUID strangerParent = aParent();
		UUID strangersChild = aStudent("Hadi", strangerParent);

		assertEquals(404, busLocation(strangerParent, m.child()).getStatus(), "another parent's child");
		assertEquals(404, busLocation(m.parent(), strangersChild).getStatus(), "someone else's child");
		assertEquals(404, busLocation(m.parent(), UUID.randomUUID()).getStatus(), "an unknown child");
		assertEquals(404, send(get("/api/parent/children/" + m.child() + "/bus-location")
				.with(as(Role.PARENT, m.parent(), UUID.randomUUID()))).getStatus(), "a parent of another school");
		assertEquals(403, send(get("/api/parent/children/" + m.child() + "/bus-location")
				.with(as(Role.DRIVER, m.bus().driverUserId()))).getStatus());
		assertEquals(401, send(get("/api/parent/children/" + m.child() + "/bus-location")).getStatus());
		assertEquals("LIVE", parentSees(m));
	}

	@Test
	void aParentSeesNothingWhenThereIsNothingToShow() throws Exception {
		UUID parent = aParent();
		UUID noRoute = aStudent("Layla", parent);
		Bus bus = aBus("Hamra morning run");
		UUID child = aStudent("Dana", parent);
		onRoute(bus, child);
		Morning idle = new Morning(bus, runId(bus, MORNING), parent, child);

		assertEquals("UNAVAILABLE", JsonPath.read(busLocation(parent, noRoute).getContentAsString(), "$.status"));
		assertEquals("UNAVAILABLE", parentSees(idle), "the run has not started");
		start(bus, idle.run());
		assertEquals("UNAVAILABLE", parentSees(idle), "the driver is not sharing");
		share(bus, idle.run(), true);
		assertEquals("UNAVAILABLE", parentSees(idle), "no position yet");
		position(bus, idle.run());
		assertEquals("LIVE", parentSees(idle));
		aHoliday(WEDNESDAY);
		assertEquals("UNAVAILABLE", parentSees(idle), "a holiday");
	}

	@Test
	void theMapEndsWhenTheChildIsNoLongerWaiting() throws Exception {
		Morning m = sharing();
		assertEquals("LIVE", parentSees(m));

		confirm(m.bus(), m.run(), m.child(), "PICKED_UP");

		assertEquals("UNAVAILABLE", parentSees(m), "picked up on the morning run");
		assertEquals("LIVE", headStatus(headLocations(school).getContentAsString(), m.run()),
				"the school still sees the bus");
	}

	@Test
	void anAbsentChildAndAnAfternoonDropOffEndTheMapToo() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID absent = aStudent("Dana", parent);
		UUID rides = aStudent("Omar", aParent());
		onRoute(bus, absent, rides);
		absentToday(parent, absent);
		String afternoon = runId(bus, "AFTERNOON");
		start(bus, afternoon);
		share(bus, afternoon, true);
		position(bus, afternoon);

		assertEquals("UNAVAILABLE", JsonPath.read(busLocation(parent, absent).getContentAsString(), "$.status"));

		UUID home = aStudent("Hadi", parent);
		onRoute(bus, home);
		assertEquals("LIVE", JsonPath.read(busLocation(parent, home).getContentAsString(), "$.status"));
		confirm(bus, afternoon, home, "PICKED_UP");
		assertEquals("LIVE", JsonPath.read(busLocation(parent, home).getContentAsString(), "$.status"),
				"on the bus, not home yet");
		confirm(bus, afternoon, home, "DROPPED_OFF");
		assertEquals("UNAVAILABLE", JsonPath.read(busLocation(parent, home).getContentAsString(), "$.status"));
	}

	@Test
	void theAnswerIsThePositionSentWithTheServersTime() throws Exception {
		Morning m = aMorningInProgress();
		share(m.bus(), m.run(), true);

		assertEquals(204, position(m.bus(), m.run(),
				"{\"latitude\":33.9012,\"longitude\":35.4987,\"accuracyMeters\":7.5,\"receivedAt\":\"2000-01-01T00:00:00Z\"}")
				.getStatus());

		String body = busLocation(m.parent(), m.child()).getContentAsString();
		assertEquals(33.9012, JsonPath.<Double>read(body, "$.position.latitude"));
		assertEquals(35.4987, JsonPath.<Double>read(body, "$.position.longitude"));
		assertEquals(7.5, JsonPath.<Double>read(body, "$.position.accuracyMeters"));
		assertEquals(clock.instant(), Instant.parse(JsonPath.read(body, "$.position.receivedAt")),
				"the server's time, not one the phone sent");
		assertEquals(0, JsonPath.<Integer>read(body, "$.position.ageSeconds"));
	}

	@Test
	void twoBusesSharingAtOnceEachParentSeesTheirOwn() throws Exception {
		Morning hamra = aMorningInProgress();
		Morning verdun = aMorningInProgress();
		share(hamra.bus(), hamra.run(), true);
		share(verdun.bus(), verdun.run(), true);
		position(hamra.bus(), hamra.run(), "{\"latitude\":33.1,\"longitude\":35.1,\"accuracyMeters\":1}");
		position(verdun.bus(), verdun.run(), "{\"latitude\":33.2,\"longitude\":35.2,\"accuracyMeters\":2}");

		assertEquals(33.1, JsonPath.<Double>read(busLocation(hamra.parent(), hamra.child()).getContentAsString(),
				"$.position.latitude"));
		assertEquals(33.2, JsonPath.<Double>read(busLocation(verdun.parent(), verdun.child()).getContentAsString(),
				"$.position.latitude"));
		String list = headLocations(school).getContentAsString();
		assertEquals(List.of(33.1), JsonPath.read(list, "$[?(@.runId == '" + hamra.run() + "')].position.latitude"));
		assertEquals(List.of(33.2), JsonPath.read(list, "$[?(@.runId == '" + verdun.run() + "')].position.latitude"));
	}

	// ---------------------------------------------------------------- the head of transportation

	@Test
	void theHeadSeesOnlyTheirSchoolsRunsInProgress() throws Exception {
		Morning sharing = sharing();
		Bus silent = aBus("Verdun morning run");
		onRoute(silent, aStudent("Samir", null));
		String silentRun = runId(silent, MORNING);
		start(silent, silentRun);
		Bus waiting = aBus("Achrafieh morning run");
		onRoute(waiting, aStudent("Rana", null));
		String waitingRun = runId(waiting, MORNING);

		String body = headLocations(school).getContentAsString();

		assertEquals(2, JsonPath.<List<Object>>read(body, "$").size(), body);
		assertEquals("LIVE", headStatus(body, sharing.run()));
		assertEquals("UNAVAILABLE", headStatus(body, silentRun));
		assertTrue(JsonPath.<List<Object>>read(body, "$[?(@.runId == '" + waitingRun + "')]").isEmpty(),
				"a run that has not started");
		assertEquals("[]", headLocations(UUID.randomUUID()).getContentAsString(), "another school sees none of it");
		assertEquals(403, send(get(HEAD_RUNS + "/locations").with(as(Role.PARENT, UUID.randomUUID()))).getStatus());
		assertEquals(401, send(get(HEAD_RUNS + "/locations")).getStatus());
		aHoliday(WEDNESDAY);
		assertEquals("[]", headLocations(school).getContentAsString());
	}

	@Test
	void theHeadAndTheDriverSeeWhetherTheDriverIsSharing() throws Exception {
		Morning m = aMorningInProgress();
		assertFalse(sharingOf(headRuns(null), m.run()));

		share(m.bus(), m.run(), true);

		assertTrue(sharingOf(headRuns(null), m.run()));
		assertTrue(sharingOf(driverToday(m.bus()), m.run()));
	}

	// ---------------------------------------------------------------- the samples

	@Test
	void theSampleBodiesAreAcceptedAndTheAnswersHaveTheSamplesFields() throws Exception {
		Morning m = aMorningInProgress();

		MockHttpServletResponse on = send(put("/api/driver/runs/" + m.run() + "/location-sharing")
				.with(as(Role.DRIVER, m.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content(Files.readString(Path.of(SAMPLES + "location-sharing.json"))));
		assertEquals(200, on.getStatus());
		assertEquals(204, position(m.bus(), m.run(), Files.readString(Path.of(SAMPLES + "location-update.json")))
				.getStatus());

		assertSameFields("bus-location-live.json", busLocation(m.parent(), m.child()).getContentAsString());
		clock.set(clock.instant().plusSeconds(100));
		assertSameFields("bus-location-stale.json", busLocation(m.parent(), m.child()).getContentAsString());
		clock.set(clock.instant().plusSeconds(1000));
		assertSameFields("bus-location-unavailable.json", busLocation(m.parent(), m.child()).getContentAsString());

		Morning live = sharing();
		Morning silent = aMorningInProgress();
		String list = headLocations(school).getContentAsString();
		String sample = Files.readString(Path.of(SAMPLES + "run-locations.json"));
		assertEquals(keys(sample, "$[0]"), keys(list, "$[?(@.runId == '" + live.run() + "')]"));
		assertEquals(keys(sample, "$[0].position"), keys(list, "$[?(@.runId == '" + live.run() + "')].position"));
		assertEquals(keys(sample, "$[1]"), keys(list, "$[?(@.runId == '" + silent.run() + "')]"));
	}

	private void assertSameFields(String sampleFile, String actual) throws Exception {
		String sample = Files.readString(Path.of(SAMPLES + sampleFile));
		assertEquals(keys(sample, "$"), keys(actual, "$"), sampleFile);
		assertEquals(keys(sample, "$.position"), keys(actual, "$.position"), sampleFile);
	}

	/** The field names of the object at the path (a filter's single match counts), or {@code [null]} for a null. */
	private static Set<String> keys(String json, String path) {
		Object found = JsonPath.read(json, path);
		if (found instanceof List<?> list) {
			found = list.isEmpty() ? null : list.get(0);
		}
		return found instanceof Map<?, ?> map ? new TreeSet<>(map.keySet().stream().map(String::valueOf).toList())
				: Set.of("null");
	}
}
