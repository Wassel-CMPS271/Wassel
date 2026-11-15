package com.wassel.backend.runs.controller;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.Parallel;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.common.WhileLocked;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.runs.entity.RunReassignment;
import com.wassel.backend.runs.entity.RunState;
import com.wassel.backend.runs.repository.RunReassignmentRepository;
import com.wassel.backend.runs.repository.RunRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SCRUM-264: the head of transportation gives a run's route to another driver (docs/contracts/runs.md, "Reassigning
 * a run's driver"). Everything goes through HTTP on the real application and PostgreSQL; each test has its own school.
 * Each refusal also checks that nothing changed: the route keeps its driver and no audit row exists.
 */
class RunReassignmentTests extends RunCriteriaSupport {

	private static final String SAMPLES = "../docs/contracts/samples/runs/";

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Autowired
	private RunRepository runRepository;

	@Autowired
	private RunReassignmentRepository reassignmentRepository;

	@Autowired
	private RouteRepository routeRepository;

	/** A real head of transportation account: the audit list reads the head's email from the user. */
	private User headUser;

	private RequestPostProcessor theHead() {
		if (headUser == null) {
			headUser = userRepository.save(User.builder().email("head-" + UUID.randomUUID() + "@wassel.test")
					.passwordHash("x").role(Role.HEAD_OF_TRANSPORT).schoolId(school).build());
		}
		return as(Role.HEAD_OF_TRANSPORT, headUser.getId());
	}

	private MockHttpServletResponse reassign(String runId, Object to, Object from, String reasonJson) throws Exception {
		return reassignAs(theHead(), runId, to, from, reasonJson);
	}

	private MockHttpServletResponse reassignAs(RequestPostProcessor caller, String runId, Object to, Object from,
			String reasonJson) throws Exception {
		return send(post(HEAD_RUNS + "/" + runId + "/reassignments").with(caller).contentType(MediaType.APPLICATION_JSON)
				.content("{\"driverId\":\"%s\",\"fromDriverId\":\"%s\"%s}".formatted(to, from,
						reasonJson == null ? "" : ",\"reason\":" + reasonJson)));
	}

	/** The body exactly as given, for what the typed helper cannot send (missing or malformed fields). */
	private MockHttpServletResponse postRaw(String runId, String json) throws Exception {
		return send(post(HEAD_RUNS + "/" + runId + "/reassignments").with(theHead())
				.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private String history(String runId) throws Exception {
		MockHttpServletResponse response = send(get(HEAD_RUNS + "/" + runId + "/reassignments").with(theHead()));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private UUID aSpare() {
		return aDriverRecord(aDriverAccount());
	}

	/** The route's driver as the head's list shows it, for the bus's morning run. */
	private String driverOnList(Bus bus) throws Exception {
		List<String> ids = JsonPath.read(headRuns(null),
				"$.runs[?(@.route.id == '" + bus.routeId() + "' && @.direction == 'MORNING')].driver.id");
		return ids.get(0);
	}

	private String countsOf(String runId) throws Exception {
		return String.valueOf((Object) JsonPath.read(headRuns(null), "$.runs[?(@.id == '" + runId + "')].counts"));
	}

	private void assertNothingChanged(Bus bus, String runId) throws Exception {
		assertEquals(bus.driverId().toString(), driverOnList(bus));
		assertEquals(0, (int) JsonPath.read(history(runId), "$.length()"));
	}

	private static String field(String json, String path) {
		return String.valueOf((Object) JsonPath.read(json, path));
	}

	// ---------------------------------------------------------------- validation (AC1)

	@Test
	void aMissingDriverIdOrFromDriverIdIsABadRequestNamingTheField() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");

		MockHttpServletResponse noDriver = postRaw(runId, "{\"fromDriverId\":\"" + bus.driverId() + "\"}");
		MockHttpServletResponse noFrom = postRaw(runId, "{\"driverId\":\"" + aSpare() + "\"}");

		assertEquals(400, noDriver.getStatus());
		assertTrue(noDriver.getContentAsString().contains("\"driverId\""), noDriver.getContentAsString());
		assertEquals(400, noFrom.getStatus());
		assertTrue(noFrom.getContentAsString().contains("\"fromDriverId\""), noFrom.getContentAsString());
		assertNothingChanged(bus, runId);
	}

	@Test
	void aReasonOver200CharactersIsABadRequest() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");

		MockHttpServletResponse answer = reassign(runId, aSpare(), bus.driverId(), "\"" + "x".repeat(201) + "\"");

		assertEquals(400, answer.getStatus());
		assertTrue(answer.getContentAsString().contains("\"reason\""), answer.getContentAsString());
		assertNothingChanged(bus, runId);
	}

	@Test
	void aMalformedIdIsABadRequest() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");

		MockHttpServletResponse body = reassign(runId, "not-a-uuid", bus.driverId(), null);
		MockHttpServletResponse path = reassign("not-a-uuid", aSpare(), bus.driverId(), null);

		assertEquals(400, body.getStatus());
		assertTrue(body.getContentAsString().contains("Malformed request body"), body.getContentAsString());
		assertEquals(400, path.getStatus());
		assertTrue(path.getContentAsString().contains("Invalid request parameter"), path.getContentAsString());
	}

	// ---------------------------------------------------------------- the change (AC2, AC3)

	@Test
	void aNotStartedRunIsReassignedAndTheAnswerIsThatRunInTheHeadsList() throws Exception {
		Bus bus = aBus("Hamra morning run");
		onRoute(bus, aStudent("Rami", null));
		String runId = runId(bus, "MORNING");
		UUID spare = aSpare();

		MockHttpServletResponse answer = reassign(runId, spare, bus.driverId(), null);

		assertEquals(201, answer.getStatus(), answer.getContentAsString());
		String body = answer.getContentAsString();
		assertEquals(spare.toString(), field(body, "$.driver.id"));
		List<Object> inList = JsonPath.read(headRuns(null), "$.runs[?(@.id == '" + runId + "')]");
		assertEquals(1, inList.size());
		assertEquals(JsonPath.read(body, "$"), inList.get(0));
		// The shape is the contract's sample, field by field (the nested objects too).
		assertSameShape("hot-reassign-run.json", body, "$", "route", "vehicle", "driver", "counts");
	}

	@Test
	void aRunInProgressKeepsItsStateTimesAndConfirmationsAndTheNewDriverSeesThem() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = aStudent("Rami", null);
		UUID salma = aStudent("Salma", null);
		onRoute(bus, rami, salma);
		String runId = runId(bus, "MORNING");
		assertEquals(200, start(bus, runId).getStatus());
		assertEquals(200, confirm(bus, runId, rami, "PICKED_UP").getStatus());
		assertEquals(200, confirm(bus, runId, salma, "NOT_PRESENT").getStatus());
		String before = driverToday(bus);
		String countsBefore = countsOf(runId);
		UUID spareUser = aDriverAccount();
		UUID spare = aDriverRecord(spareUser);

		assertEquals(201, reassign(runId, spare, bus.driverId(), "\"Karim is unwell\"").getStatus());

		Bus newBus = drivenBy(bus, spareUser, spare);
		String after = driverToday(newBus);
		assertEquals(field(before, "$.runs[0].id"), field(after, "$.runs[0].id"));
		assertEquals("IN_PROGRESS", field(after, "$.runs[0].state"));
		assertEquals(field(before, "$.runs[0].startedAt"), field(after, "$.runs[0].startedAt"));
		assertEquals(field(before, "$.runs[0].stops[*].confirmation"), field(after, "$.runs[0].stops[*].confirmation"));
		assertEquals(countsBefore, countsOf(runId));
		// the new driver carries on, the old one is out
		assertEquals(200, confirm(newBus, runId, rami, "DROPPED_OFF").getStatus());
		assertEquals(404, confirm(bus, runId, rami, "PICKED_UP").getStatus());
		assertEquals(404, end(bus, runId).getStatus());
		assertEquals(404, start(bus, runId(newBus, "AFTERNOON")).getStatus());
		assertEquals(200, end(newBus, runId).getStatus());
		assertEquals(0, (int) JsonPath.read(driverToday(bus), "$.runs.length()"));
	}

	@Test
	void bothOfTodaysRunsAndTheParentsViewShowTheNewDriver() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID parent = aParent();
		onRoute(bus, aStudent("Rami", parent));
		String runId = runId(bus, "MORNING");
		UUID spare = aSpare();

		assertEquals(201, reassign(runId, spare, bus.driverId(), null).getStatus());

		List<String> drivers = JsonPath.read(headRuns(null), "$.runs[?(@.route.id == '" + bus.routeId() + "')].driver.id");
		assertEquals(List.of(spare.toString(), spare.toString()), drivers);
		MockHttpServletResponse children = send(get("/api/parent/children").with(as(Role.PARENT, parent)));
		assertEquals(spare.toString(), field(children.getContentAsString(), "$[0].driver.id"));
	}

	@Test
	void aFinishedRunCannotBeReassigned() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		assertEquals(200, start(bus, runId).getStatus());
		assertEquals(200, end(bus, runId).getStatus());

		MockHttpServletResponse answer = reassign(runId, aSpare(), bus.driverId(), null);

		assertEquals(409, answer.getStatus());
		assertTrue(answer.getContentAsString().contains("FINISHED"), answer.getContentAsString());
		assertNothingChanged(bus, runId);
	}

	@Test
	void onlyTodaysRunsCanBeReassigned() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String yesterdays = runId(bus, "MORNING");
		setNow(WEDNESDAY.plusDays(1), LocalTime.of(7, 0));

		MockHttpServletResponse answer = reassign(yesterdays, aSpare(), bus.driverId(), null);

		assertEquals(409, answer.getStatus());
		assertTrue(answer.getContentAsString().contains("Only today's runs can be reassigned."), answer.getContentAsString());
		setNow(WEDNESDAY, LocalTime.of(7, 0));
		assertNothingChanged(bus, yesterdays);
	}

	@Test
	void aHolidayTodayRefusesTheReassignment() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		aHoliday(WEDNESDAY);

		MockHttpServletResponse answer = reassign(runId, aSpare(), bus.driverId(), null);

		assertEquals(409, answer.getStatus());
		assertTrue(answer.getContentAsString().contains("Only today's runs can be reassigned."), answer.getContentAsString());
		holidayRepository.deleteAll(holidayRepository.findAll().stream().filter(day -> school.equals(day.getSchoolId())).toList());
		assertNothingChanged(bus, runId);
	}

	@Test
	void theDriverTheRouteAlreadyHasIsA200ThatRecordsNothing() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID spare = aSpare();
		assertEquals(201, reassign(runId, spare, bus.driverId(), null).getStatus());

		// a retry after a lost answer: the same request again
		MockHttpServletResponse again = reassign(runId, spare, bus.driverId(), null);

		assertEquals(200, again.getStatus(), again.getContentAsString());
		assertEquals(spare.toString(), field(again.getContentAsString(), "$.driver.id"));
		assertEquals(1, (int) JsonPath.read(history(runId), "$.length()"));
	}

	@Test
	void anUnknownRunAndAnotherSchoolsRunAreTheSame404() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID spare = aSpare();
		RequestPostProcessor otherHead = as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), UUID.randomUUID());

		MockHttpServletResponse unknown = reassign(UUID.randomUUID().toString(), spare, bus.driverId(), null);
		MockHttpServletResponse foreign = reassignAs(otherHead, runId, spare, bus.driverId(), null);
		MockHttpServletResponse foreignList = send(get(HEAD_RUNS + "/" + runId + "/reassignments").with(otherHead));

		assertEquals(404, unknown.getStatus());
		assertEquals(404, foreign.getStatus());
		assertEquals(404, foreignList.getStatus());
		assertEquals(field(unknown.getContentAsString(), "$.detail"), field(foreign.getContentAsString(), "$.detail"));
		assertNothingChanged(bus, runId);
	}

	// ---------------------------------------------------------------- the replacement and the precondition (AC2)

	@Test
	void aStaleFromDriverIsA409NamingTheCurrentDriver() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");

		MockHttpServletResponse answer = reassign(runId, aSpare(), aSpare(), null);

		assertEquals(409, answer.getStatus());
		assertTrue(answer.getContentAsString().contains("Karim Haddad"), answer.getContentAsString());
		assertTrue(answer.getContentAsString().contains("Reload"), answer.getContentAsString());
		assertNothingChanged(bus, runId);
	}

	@Test
	void anUnknownDriverAndAnotherSchoolsDriverAreA404() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		Driver foreign = driverRepository.save(Driver.builder().schoolId(UUID.randomUUID()).firstName("Far")
				.lastName("Away").phone("+961 3 999 999").email(UUID.randomUUID() + "@wassel.test")
				.status(DriverStatus.ACTIVE).invitedAt(Instant.now()).build());

		assertEquals(404, reassign(runId, UUID.randomUUID(), bus.driverId(), null).getStatus());
		assertEquals(404, reassign(runId, foreign.getId(), bus.driverId(), null).getStatus());
		assertNothingChanged(bus, runId);
	}

	@Test
	void aDeactivatedReplacementIsA409OnTheDriverField() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID spare = aSpare();
		assertEquals(200, send(patch("/api/head-of-transport/drivers/" + spare + "/revoke").with(theHead())).getStatus());

		MockHttpServletResponse answer = reassign(runId, spare, bus.driverId(), null);

		assertEquals(409, answer.getStatus());
		assertTrue(field(answer.getContentAsString(), "$.errors.driverId").contains("deactivated"));
		assertNothingChanged(bus, runId);
	}

	@Test
	void anInvitedReplacementIsA409OnTheDriverField() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		MockHttpServletResponse invited = send(post("/api/head-of-transport/drivers").with(theHead())
				.contentType(MediaType.APPLICATION_JSON).content("{\"firstName\":\"Nadim\",\"lastName\":\"Khoury\","
						+ "\"phone\":\"+961 3 777 123\",\"email\":\"nadim-" + UUID.randomUUID() + "@wassel.test\"}"));
		assertEquals(201, invited.getStatus(), invited.getContentAsString());

		MockHttpServletResponse answer = reassign(runId, field(invited.getContentAsString(), "$.id"), bus.driverId(), null);

		assertEquals(409, answer.getStatus());
		assertTrue(field(answer.getContentAsString(), "$.errors.driverId").contains("account"));
		assertNothingChanged(bus, runId);
	}

	@Test
	void aDriverOnAnotherRouteIsA409NamingThatRoute() throws Exception {
		Bus bus = aBus("Hamra morning run");
		Bus other = aBus("Verdun morning run");
		String runId = runId(bus, "MORNING");

		MockHttpServletResponse answer = reassign(runId, other.driverId(), bus.driverId(), null);

		assertEquals(409, answer.getStatus());
		assertTrue(field(answer.getContentAsString(), "$.errors.driverId").contains("Verdun morning run"));
		assertNothingChanged(bus, runId);
	}

	@Test
	void aDeactivatedCurrentDriverCanBeReplaced() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		assertEquals(200, send(patch("/api/head-of-transport/drivers/" + bus.driverId() + "/revoke").with(theHead()))
				.getStatus());
		UUID spare = aSpare();

		assertEquals(201, reassign(runId, spare, bus.driverId(), null).getStatus());
		assertEquals(spare.toString(), driverOnList(bus));
	}

	// ---------------------------------------------------------------- the audit trail (AC4)

	@Test
	void theChangeIsRecordedOnBothRunsOfTheDayWithEveryContractField() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String morning = runId(bus, "MORNING");
		String afternoon = runId(bus, "AFTERNOON");
		assertEquals(200, start(bus, morning).getStatus());
		UUID spare = aSpare();
		assertEquals(201, reassign(morning, spare, bus.driverId(), "\"  Karim is unwell \"").getStatus());

		for (String run : List.of(morning, afternoon)) {
			String list = history(run);
			assertEquals(1, (int) JsonPath.read(list, "$.length()"), run);
			assertEquals(morning, field(list, "$[0].runId"));
			assertEquals("MORNING", field(list, "$[0].direction"));
			assertEquals("IN_PROGRESS", field(list, "$[0].runState"));
			assertEquals(bus.driverId().toString(), field(list, "$[0].fromDriver.id"));
			assertEquals("Karim", field(list, "$[0].fromDriver.firstName"));
			assertEquals(spare.toString(), field(list, "$[0].toDriver.id"));
			assertEquals(headUser.getId().toString(), field(list, "$[0].changedBy.id"));
			assertEquals(headUser.getEmail(), field(list, "$[0].changedBy.email"));
			assertEquals(WEDNESDAY_7AM.toString(), field(list, "$[0].changedAt"));
			assertEquals("Karim is unwell", field(list, "$[0].reason"));
		}
		assertSameShape("hot-reassignments.json", history(morning), "$[0]", "fromDriver", "toDriver", "changedBy");
	}

	@Test
	void aBlankReasonIsStoredAsNullAndTwoChangesAreListedNewestFirst() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID spare = aSpare();
		assertEquals(201, reassign(runId, spare, bus.driverId(), "\"   \"").getStatus());
		clock.set(clock.instant().plusSeconds(60));
		assertEquals(201, reassign(runId, bus.driverId(), spare, null).getStatus());

		String list = history(runId);

		assertEquals(2, (int) JsonPath.read(list, "$.length()"));
		assertEquals(bus.driverId().toString(), field(list, "$[0].toDriver.id"));
		assertEquals(spare.toString(), field(list, "$[1].toDriver.id"));
		assertEquals("null", field(list, "$[1].reason"));
	}

	@Test
	void aRunsListHoldsOnlyItsOwnDatesChanges() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String wednesday = runId(bus, "MORNING");
		assertEquals(201, reassign(wednesday, aSpare(), bus.driverId(), null).getStatus());
		setNow(WEDNESDAY.plusDays(1), LocalTime.of(7, 0));
		headRuns(null); // the head's first look creates Thursday's runs
		List<String> thursday = JsonPath.read(headRuns(null),
				"$.runs[?(@.route.id == '" + bus.routeId() + "' && @.direction == 'MORNING')].id");

		assertEquals(1, (int) JsonPath.read(history(wednesday), "$.length()"));
		assertEquals(0, (int) JsonPath.read(history(thursday.get(0)), "$.length()"));
	}

	// ---------------------------------------------------------------- competing requests (AC2, AC4)

	private Callable<Integer> reassigning(String runId, UUID to, UUID from) {
		return () -> reassign(runId, to, from, null).getStatus();
	}

	@Test
	void twoHeadsReplacingTheSameDriverAtOnceLeaveExactlyOneChange() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID first = aSpare();
		UUID second = aSpare();

		List<Integer> statuses = Parallel.inParallel(List.of(reassigning(runId, first, bus.driverId()),
				reassigning(runId, second, bus.driverId())));

		assertEquals(List.of(201, 409), statuses.stream().sorted().toList());
		String list = history(runId);
		assertEquals(1, (int) JsonPath.read(list, "$.length()"));
		assertEquals(field(list, "$[0].toDriver.id"), driverOnList(bus));
	}

	@Test
	void twoRoutesTakingTheSameSpareAtOnceGiveItToExactlyOne() throws Exception {
		Bus hamra = aBus("Hamra morning run");
		Bus verdun = aBus("Verdun morning run");
		String hamraRun = runId(hamra, "MORNING");
		String verdunRun = runId(verdun, "MORNING");
		UUID spare = aSpare();

		List<Integer> statuses = Parallel.inParallel(List.of(reassigning(hamraRun, spare, hamra.driverId()),
				reassigning(verdunRun, spare, verdun.driverId())));

		assertEquals(List.of(201, 409), statuses.stream().sorted().toList());
		int changes = (int) JsonPath.read(history(hamraRun), "$.length()") + (int) JsonPath.read(history(verdunRun), "$.length()");
		assertEquals(1, changes);
		List<String> drivers = JsonPath.read(headRuns(null), "$.runs[?(@.direction == 'MORNING')].driver.id");
		assertEquals(1, drivers.stream().filter(spare.toString()::equals).count());
		assertEquals(2, drivers.stream().distinct().count());
	}

	@Test
	void theSameRequestTwiceAtOnceChangesOnceAndAnswers201Then200() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID spare = aSpare();

		List<Integer> statuses = Parallel.inParallel(List.of(reassigning(runId, spare, bus.driverId()),
				reassigning(runId, spare, bus.driverId())));

		assertEquals(List.of(200, 201), statuses.stream().sorted().toList());
		assertEquals(1, (int) JsonPath.read(history(runId), "$.length()"));
	}

	@Test
	void aLostRaceOnTheDriversUniqueKeyIsA409OnTheDriverFieldAndChangesNothing() throws Exception {
		Bus hamra = aBus("Hamra morning run");
		Bus verdun = aBus("Verdun morning run");
		String hamraRun = runId(hamra, "MORNING");
		UUID spare = aSpare();

		// Verdun takes the spare in a transaction that has not committed yet: Hamra's checks cannot see it, and its
		// own write waits on the unique key until that transaction ends, then loses.
		Logger jdbcErrors = (Logger) LoggerFactory.getLogger("org.hibernate.orm.jdbc.error");
		ListAppender<ILoggingEvent> logged = new ListAppender<>();
		logged.start();
		jdbcErrors.addAppender(logged);
		MockHttpServletResponse answer;
		try {
			answer = WhileLocked.send(transactionTemplate, () -> {
				Route verdunRoute = routeRepository.findBySchoolIdAndId(school, UUID.fromString(verdun.routeId())).orElseThrow();
				verdunRoute.setDriverId(spare);
				routeRepository.saveAndFlush(verdunRoute);
			}, () -> reassign(hamraRun, spare, hamra.driverId(), null));
		} finally {
			jdbcErrors.detachAppender(logged);
		}

		assertEquals(409, answer.getStatus(), answer.getContentAsString());
		assertEquals("Driver is already on another route.", field(answer.getContentAsString(), "$.errors.driverId"));
		assertNothingChanged(hamra, hamraRun);
		// the refused write is the only statement that ran: no second one failing with "current transaction is aborted"
		List<String> messages = logged.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
		assertTrue(messages.stream().anyMatch(message -> message.contains("uq_routes_school_driver")), messages.toString());
		assertTrue(messages.stream().noneMatch(message -> message.contains("current transaction is aborted")), messages.toString());
	}

	@Test
	void aReassignmentWaitsForTheRunsRowLockBeforeItChecksAnything() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID spare = aSpare();

		MockHttpServletResponse answer = WhileLocked.send(transactionTemplate,
				() -> runRepository.findLockedBySchoolIdAndId(school, UUID.fromString(runId)).orElseThrow(),
				() -> reassign(runId, spare, bus.driverId(), null));

		assertEquals(201, answer.getStatus(), answer.getContentAsString());
		assertEquals(spare.toString(), driverOnList(bus));
	}

	// ---------------------------------------------------------------- review fixes (SCRUM-264, step 5)

	@Test
	void aDriverSendingABadBodyGets400AndWithAValidBody403AndSignedOutIs401() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		RequestPostProcessor driver = as(Role.DRIVER, bus.driverUserId());
		String path = HEAD_RUNS + "/" + runId + "/reassignments";

		MockHttpServletResponse bad = send(post(path).with(driver).contentType(MediaType.APPLICATION_JSON).content("{}"));
		MockHttpServletResponse valid = send(post(path).with(driver).contentType(MediaType.APPLICATION_JSON)
				.content("{\"driverId\":\"%s\",\"fromDriverId\":\"%s\"}".formatted(aSpare(), bus.driverId())));
		MockHttpServletResponse signedOut = send(post(path).contentType(MediaType.APPLICATION_JSON).content("{}"));

		assertEquals(400, bad.getStatus(), bad.getContentAsString());
		assertEquals(403, valid.getStatus());
		assertEquals(401, signedOut.getStatus());
		assertNothingChanged(bus, runId);
	}

	@Test
	void aRunWhoseRouteWasDeletedIsRunNotFound() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		assertEquals(204, send(delete(ROUTES + "/" + bus.routeId()).with(head())).getStatus());

		MockHttpServletResponse answer = reassign(runId, aSpare(), bus.driverId(), null);

		assertEquals(404, answer.getStatus(), answer.getContentAsString());
		assertEquals("Run not found", field(answer.getContentAsString(), "$.detail"));
		assertEquals(0, (int) JsonPath.read(history(runId), "$.length()"));
	}

	@Test
	void theChecksRunInTheContractsOrder() throws Exception {
		Bus bus = aBus("Hamra morning run");
		Bus other = aBus("Verdun morning run");
		String runId = runId(bus, "MORNING");
		UUID strangerToTheRoute = aSpare();

		// a stale fromDriverId comes before every check of the replacement
		MockHttpServletResponse staleAndTaken = reassign(runId, other.driverId(), strangerToTheRoute, null);
		MockHttpServletResponse staleAndUnknown = reassign(runId, UUID.randomUUID(), strangerToTheRoute, null);
		assertEquals(409, staleAndTaken.getStatus());
		assertTrue(field(staleAndTaken.getContentAsString(), "$.detail").contains("Karim Haddad"), staleAndTaken.getContentAsString());
		assertEquals(409, staleAndUnknown.getStatus());
		assertTrue(field(staleAndUnknown.getContentAsString(), "$.detail").contains("Reload"), staleAndUnknown.getContentAsString());
		// an unknown replacement comes before the replacement's state; its state before "on another route"
		assertEquals(404, reassign(runId, UUID.randomUUID(), bus.driverId(), null).getStatus());
		assertEquals(200, send(patch("/api/head-of-transport/drivers/" + other.driverId() + "/revoke").with(theHead())).getStatus());
		MockHttpServletResponse deactivatedAndTaken = reassign(runId, other.driverId(), bus.driverId(), null);
		assertEquals(409, deactivatedAndTaken.getStatus());
		assertTrue(field(deactivatedAndTaken.getContentAsString(), "$.errors.driverId").contains("deactivated"),
				deactivatedAndTaken.getContentAsString());
		// the driver the route already has is a 200 whatever fromDriverId says
		assertEquals(200, reassign(runId, bus.driverId(), strangerToTheRoute, null).getStatus());
		assertNothingChanged(bus, runId);

		// a finished run is refused before anything about the drivers is looked at
		assertEquals(200, start(bus, runId).getStatus());
		assertEquals(200, end(bus, runId).getStatus());
		MockHttpServletResponse finished = reassign(runId, UUID.randomUUID(), strangerToTheRoute, null);
		assertEquals(409, finished.getStatus());
		assertTrue(field(finished.getContentAsString(), "$.detail").contains("FINISHED"), finished.getContentAsString());
	}

	@Test
	void theVehicleAndEachDriversOwnAssignedVehicleAreUntouched() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID spareVehicle = aVehicle();
		Driver old = driverRepository.findById(bus.driverId()).orElseThrow();
		old.setAssignedVehicleId(bus.vehicleId());
		driverRepository.save(old);
		Driver spare = driverRepository.save(Driver.builder().schoolId(school).firstName("Nadim").lastName("Khoury")
				.phone("+961 3 888 111").email("spare-" + UUID.randomUUID() + "@wassel.test").status(DriverStatus.ACTIVE)
				.invitedAt(Instant.now()).assignedVehicleId(spareVehicle).build());

		MockHttpServletResponse answer = reassign(runId, spare.getId(), bus.driverId(), null);

		assertEquals(201, answer.getStatus(), answer.getContentAsString());
		assertEquals(bus.vehicleId().toString(), field(answer.getContentAsString(), "$.vehicle.id"));
		assertEquals(bus.vehicleId(), driverRepository.findById(bus.driverId()).orElseThrow().getAssignedVehicleId());
		assertEquals(spareVehicle, driverRepository.findById(spare.getId()).orElseThrow().getAssignedVehicleId());
	}

	@Test
	void anAfternoonRunCanBeReassignedAndBothRunsListTheChange() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String morning = runId(bus, "MORNING");
		String afternoon = runId(bus, "AFTERNOON");
		UUID spareUser = aDriverAccount();
		UUID spare = aDriverRecord(spareUser);

		assertEquals(201, reassign(afternoon, spare, bus.driverId(), null).getStatus());

		for (String run : List.of(morning, afternoon)) {
			String list = history(run);
			assertEquals(1, (int) JsonPath.read(list, "$.length()"), run);
			assertEquals(afternoon, field(list, "$[0].runId"));
			assertEquals("AFTERNOON", field(list, "$[0].direction"));
			assertEquals("NOT_STARTED", field(list, "$[0].runState"));
		}
		List<String> drivers = JsonPath.read(headRuns(null), "$.runs[?(@.route.id == '" + bus.routeId() + "')].driver.id");
		assertEquals(List.of(spare.toString(), spare.toString()), drivers);
		assertEquals(200, start(drivenBy(bus, spareUser, spare), morning).getStatus());
		assertEquals(404, start(bus, afternoon).getStatus());
	}

	@Test
	void aReasonOfExactly200CharactersIsKeptAndPaddingDoesNotCountAgainstTheLimit() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID spare = aSpare();

		assertEquals(201, reassign(runId, spare, bus.driverId(), "\"" + "x".repeat(200) + "\"").getStatus());
		clock.set(clock.instant().plusSeconds(60));
		assertEquals(201, reassign(runId, bus.driverId(), spare, "\"" + "y".repeat(195) + " ".repeat(10) + "\"").getStatus());

		String list = history(runId);
		assertEquals("y".repeat(195), field(list, "$[0].reason"));
		assertEquals("x".repeat(200), field(list, "$[1].reason"));
	}

	@Test
	void aDriverRevokedMidRunCanStillBeReplacedAndTheRunKeepsItsState() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = aStudent("Rami", null);
		onRoute(bus, rami);
		String runId = runId(bus, "MORNING");
		assertEquals(200, start(bus, runId).getStatus());
		assertEquals(200, confirm(bus, runId, rami, "PICKED_UP").getStatus());
		assertEquals(200, send(patch("/api/head-of-transport/drivers/" + bus.driverId() + "/revoke").with(theHead())).getStatus());
		UUID spare = aSpare();

		MockHttpServletResponse answer = reassign(runId, spare, bus.driverId(), "\"Account revoked\"");

		assertEquals(201, answer.getStatus(), answer.getContentAsString());
		assertEquals("IN_PROGRESS", field(answer.getContentAsString(), "$.state"));
		assertEquals(1, (int) JsonPath.read(answer.getContentAsString(), "$.counts.pickedUp"));
		assertEquals("IN_PROGRESS", field(history(runId), "$[0].runState"));
	}

	@Test
	void changedByHasANullEmailWhenThatAccountIsGoneAndOnlyTheSchoolsOwnUsersAreRead() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		assertEquals(201, reassign(runId, aSpare(), bus.driverId(), null).getStatus());
		User outsider = userRepository.save(User.builder().email("outsider-" + UUID.randomUUID() + "@wassel.test")
				.passwordHash("x").role(Role.HEAD_OF_TRANSPORT).schoolId(UUID.randomUUID()).build());
		RunReassignment first = reassignmentRepository.findAll().stream()
				.filter(row -> row.getSchoolId().equals(school)).findAny().orElseThrow();
		reassignmentRepository.save(RunReassignment.builder().schoolId(school).runId(first.getRunId())
				.routeId(first.getRouteId()).runDate(first.getRunDate()).runState(RunState.NOT_STARTED)
				.fromDriverId(first.getToDriverId()).toDriverId(first.getFromDriverId()).changedByUserId(outsider.getId())
				.changedAt(first.getChangedAt().plusSeconds(1)).build());
		userRepository.deleteById(headUser.getId());

		String list = history(runId);

		assertEquals(2, (int) JsonPath.read(list, "$.length()"));
		assertEquals("null", field(list, "$[0].changedBy.email"), "another school's user is not read");
		assertEquals(outsider.getId().toString(), field(list, "$[0].changedBy.id"));
		assertEquals("null", field(list, "$[1].changedBy.email"), "the deleted account");
		assertEquals(headUser.getId().toString(), field(list, "$[1].changedBy.id"));
	}

	@Test
	void anAuditRowForAFinishedRunIsRefusedByTheDatabase() {
		RunReassignment finished = RunReassignment.builder().schoolId(school).runId(UUID.randomUUID())
				.routeId(UUID.randomUUID()).runDate(WEDNESDAY).runState(RunState.FINISHED).fromDriverId(UUID.randomUUID())
				.toDriverId(UUID.randomUUID()).changedByUserId(UUID.randomUUID()).changedAt(Instant.now()).build();

		assertThrows(DataIntegrityViolationException.class, () -> reassignmentRepository.saveAndFlush(finished));
	}

	/** The object at {@code path}, and each nested object under it, has the same fields as in the contract's sample file. */
	private static void assertSameShape(String sampleFile, String actual, String path, String... nested) throws Exception {
		String sample = Files.readString(Path.of(SAMPLES + sampleFile));
		assertEquals(keys(sample, path), keys(actual, path), path);
		for (String child : nested) {
			assertEquals(keys(sample, path + "." + child), keys(actual, path + "." + child), child);
		}
	}

	private static Set<String> keys(String json, String path) {
		Map<String, Object> object = JsonPath.read(json, path);
		return object.keySet();
	}
}
