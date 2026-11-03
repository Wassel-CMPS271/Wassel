package com.wassel.backend.parent.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.absences.entity.Absence;
import com.wassel.backend.absences.repository.AbsenceRepository;
import com.wassel.backend.common.MutableClock;
import com.wassel.backend.common.config.ClockConfig;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.dto.ReorderStopsRequest;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.runs.dto.ChildOnRoute;
import com.wassel.backend.runs.dto.ChildRunResponse;
import com.wassel.backend.runs.repository.RunRepository;
import com.wassel.backend.runs.service.RunService;
import com.wassel.backend.schools.entity.HalfDay;
import com.wassel.backend.schools.entity.Holiday;
import com.wassel.backend.schools.entity.SchoolSettings;
import com.wassel.backend.schools.repository.HalfDayRepository;
import com.wassel.backend.schools.repository.HolidayRepository;
import com.wassel.backend.schools.repository.SchoolSettingsRepository;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.vehicles.entity.Vehicle;
import com.wassel.backend.vehicles.repository.VehicleRepository;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-237: the parent's {@code todayRun} (docs/contracts/runs.md, "Today's run for a child"), written from the
 * ticket and the contract. It runs on the real app and PostgreSQL (Flyway): the driver's own endpoints start the runs
 * and confirm the students, and only the clock moves. What the API has no call for (absences, a student leaving a
 * route behind the API's back, deleting a run row) goes through the repositories. Every test has its own school id. A route's students are named in
 * their order on the route, so "Rami, Salma, Tarek" are stops 1 to 3. The clock is moved, so the date never depends on
 * the day the suite runs; the default day is Wednesday 2026-10-28.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ParentRunStatusTests.TestClock.class)
class ParentRunStatusTests {

	private static final String URL = "/api/parent/children";

	private static final String RUN_URL = "/api/driver/runs/";

	private static final Instant WEDNESDAY = Instant.parse("2026-10-28T08:00:00Z");

	private static final Instant SATURDAY = Instant.parse("2026-10-31T08:00:00Z");

	@TestConfiguration
	static class TestClock {

		@Bean
		@Primary
		MutableClock testClock() {
			return new MutableClock(WEDNESDAY, ClockConfig.SCHOOL_ZONE);
		}
	}

	private final UUID schoolId = UUID.randomUUID();

	private final UUID parentId = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MutableClock clock;

	@Autowired
	private RouteService routeService;

	@Autowired
	private RunRepository runRepository;

	@Autowired
	private RouteRepository routeRepository;

	@Autowired
	private VehicleRepository vehicleRepository;

	@Autowired
	private DriverRepository driverRepository;

	@Autowired
	private StudentRepository studentRepository;

	@Autowired
	private AbsenceRepository absenceRepository;

	@Autowired
	private SchoolSettingsRepository schoolSettingsRepository;

	@Autowired
	private HolidayRepository holidayRepository;

	@Autowired
	private HalfDayRepository halfDayRepository;

	@Autowired
	private RunService runService;

	@Autowired
	private EntityManagerFactory entityManagerFactory;

	@BeforeEach
	void setUp() {
		clock.set(WEDNESDAY);
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(schoolId)
				.arrivalTime(LocalTime.parse("07:30")).dismissalTime(LocalTime.parse("14:30")).build());
	}

	// ---- fixtures ----

	private LocalDate today() {
		return LocalDate.now(clock);
	}

	/** A driver who can sign in, their route and its students in order; {@code ids} finds a student by name. */
	private record Bus(UUID driverUserId, Route route, Map<String, UUID> ids) {

		UUID id(String name) {
			return ids.get(name);
		}
	}

	private Bus bus(String... names) {
		return bus(parentId, names);
	}

	/** Every student is a child of {@code parent}; use {@link #aStudent} for one that belongs to someone else. */
	private Bus bus(UUID parent, String... names) {
		UUID driverUserId = UUID.randomUUID();
		Driver driver = driverRepository.save(Driver.builder().schoolId(schoolId).userId(driverUserId)
				.firstName("Karim").lastName("Haddad").phone("+961 3 " + (100000 + (int) (Math.random() * 900000)))
				.email(UUID.randomUUID() + "@wassel.test").status(DriverStatus.ACTIVE).invitedAt(Instant.now()).build());
		Vehicle vehicle = vehicleRepository.save(Vehicle.builder().schoolId(schoolId)
				.plateNumber("A " + (100000 + (int) (Math.random() * 900000))).capacity(14).active(true).build());
		Route route = routeRepository.save(Route.builder().schoolId(schoolId).name("Hamra")
				.vehicleId(vehicle.getId()).driverId(driver.getId()).build());
		Map<String, UUID> ids = new HashMap<>();
		for (int i = 0; i < names.length; i++) {
			ids.put(names[i], aStudent(route, i + 1, names[i], parent).getId());
		}
		return new Bus(driverUserId, route, ids);
	}

	private Student aStudent(Route route, int position, String firstName, UUID parent) {
		return studentRepository.save(Student.builder().schoolId(schoolId).firstName(firstName).lastName("Nasr")
				.grade("3").guardianName("Guardian " + firstName).guardianPhone("+961 3 " + (100000 + position))
				.status(StudentStatus.ACTIVE).address(position + " Hamra Street")
				.latitude(new BigDecimal("33.8" + (900 + position))).longitude(new BigDecimal("35.5" + (100 + position)))
				.routeId(route.getId()).stopPosition(position).parentUserId(parent).build());
	}

	private RequestPostProcessor loggedIn(Role role, UUID userId, UUID forSchool) {
		User user = User.builder().id(userId).email(role + "@wassel.test").passwordHash("x").role(role)
				.schoolId(forSchool).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	/** The driver opens today's runs (which creates them) and gets the ids: 0 is the morning run, 1 the afternoon. */
	private String driverDay(Bus bus) throws Exception {
		return mockMvc.perform(get("/api/driver/runs/today").with(loggedIn(Role.DRIVER, bus.driverUserId(), schoolId)))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	private String runId(String day, int index) {
		return JsonPath.read(day, "$.runs[" + index + "].id");
	}

	private void act(Bus bus, String runId, String action) throws Exception {
		mockMvc.perform(post(RUN_URL + runId + "/" + action).with(loggedIn(Role.DRIVER, bus.driverUserId(), schoolId)))
				.andExpect(status().isOk());
	}

	private void confirm(Bus bus, String runId, String student, String status) throws Exception {
		mockMvc.perform(put(RUN_URL + runId + "/students/" + bus.id(student) + "/confirmation")
				.with(loggedIn(Role.DRIVER, bus.driverUserId(), schoolId)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"status\":\"" + status + "\"}")).andExpect(status().isOk());
	}

	/** The morning run is started, so it is in progress. Returns the day's runs for the ids. */
	private String startMorning(Bus bus) throws Exception {
		String day = driverDay(bus);
		act(bus, runId(day, 0), "start");
		return day;
	}

	private void absent(UUID studentId) {
		absenceRepository.saveAndFlush(Absence.builder().schoolId(schoolId).studentId(studentId)
				.fromDate(today()).toDate(today())
				.createdBy(UUID.randomUUID()).build());
	}

	private String childrenOf(UUID parent) throws Exception {
		return mockMvc.perform(get(URL).with(loggedIn(Role.PARENT, parent, schoolId)))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	/** {@code todayRun} of the child with that first name, in the parent's list. */
	private Object todayRun(String children, String firstName, String field) {
		List<?> found = JsonPath.read(children, "$[?(@.firstName == '" + firstName + "')].todayRun." + field);
		return found.isEmpty() ? null : found.get(0);
	}

	private void assertRun(String children, String firstName, String direction, String state, Integer stopsLeft) {
		assertEquals(direction, todayRun(children, firstName, "direction"), firstName + " direction");
		assertEquals(state, todayRun(children, firstName, "state"), firstName + " state");
		assertEquals(stopsLeft, todayRun(children, firstName, "stopsLeft"), firstName + " stopsLeft");
	}

	private void assertNoTodayRun() throws Exception {
		mockMvc.perform(get(URL).with(loggedIn(Role.PARENT, parentId, schoolId)))
				.andExpect(jsonPath("$[0].todayRun").value(nullValue()));
	}

	/** Takes the student off their route behind the route API's back, as a race with the head's click would. */
	private void leaveRoute(UUID studentId) {
		Student student = studentRepository.findById(studentId).orElseThrow();
		student.setRouteId(null);
		student.setStopPosition(null);
		studentRepository.save(student);
	}

	/** The SQL statements the app sends to answer this parent's list once. */
	private long statementsFor(UUID parent) throws Exception {
		Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
		statistics.setStatisticsEnabled(true);
		statistics.clear();
		childrenOf(parent);
		return statistics.getPrepareStatementCount();
	}

	// ---- shape ----

	@Test
	void todayRunHasExactlyTheFieldsOfTheContractSample() throws Exception {
		Bus bus = bus("Rami", "Tarek");
		startMorning(bus);

		String response = childrenOf(parentId);
		String sample = Files.readString(Path.of("../docs/contracts/samples/runs/parent-children.json"));

		assertEquals(JsonPath.<Map<String, Object>>read(sample, "$[1].todayRun").keySet(),
				JsonPath.<Map<String, Object>>read(response, "$[1].todayRun").keySet());
	}

	// ---- no run to show ----

	@Test
	void aSchoolDayBeforeAnyoneOpenedTheRunsIsNotStartedAndCreatesNothing() throws Exception {
		Bus bus = bus("Tarek");

		assertRun(childrenOf(parentId), "Tarek", "MORNING", "NOT_STARTED", null);

		assertTrue(runRepository.findBySchoolIdAndRunDateAndRouteIdIn(schoolId, today(),
				List.of(bus.route().getId())).isEmpty(), "a parent's GET must not create runs");
	}

	@Test
	void aWeekendHasNoRunToShow() throws Exception {
		Bus bus = bus("Tarek");
		startMorning(bus);
		clock.set(SATURDAY);

		assertNoTodayRun();
	}

	@Test
	void aCalendarHolidayHasNoRunToShow() throws Exception {
		Bus bus = bus("Tarek");
		startMorning(bus);
		holidayRepository.save(Holiday.builder().schoolId(schoolId).date(today())
				.name("Snow day").build());

		assertNoTodayRun();
	}

	@Test
	void aHalfDayStillShowsTheRun() throws Exception {
		Bus bus = bus("Tarek");
		halfDayRepository.save(HalfDay.builder().schoolId(schoolId).date(today()).build());
		startMorning(bus);

		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", 0);
	}

	@Test
	void aChildWithNoRouteHasNoRunToShow() throws Exception {
		Bus bus = bus("Tarek");
		startMorning(bus);
		leaveRoute(bus.id("Tarek"));

		mockMvc.perform(get(URL).with(loggedIn(Role.PARENT, parentId, schoolId)))
				.andExpect(jsonPath("$[0].route").value(nullValue()));
		assertNoTodayRun();
	}

	// ---- stops left ----

	@Test
	void stopsLeftCountsWhatTheBusStillHasToDoBeforeTheChild() throws Exception {
		Bus bus = bus("Dana", "Omar", "Rami", "Salma", "Tarek");
		String day = startMorning(bus);
		confirm(bus, runId(day, 0), "Dana", "PICKED_UP");
		confirm(bus, runId(day, 0), "Omar", "NOT_PRESENT");
		absent(bus.id("Rami"));

		// Dana is done, Omar is not present, Rami is absent: only Salma is still ahead of Tarek.
		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", 1);
	}

	@Test
	void aStopPickedUpOutOfOrderDoesNotCount() throws Exception {
		Bus bus = bus("Rami", "Salma", "Tarek");
		String day = startMorning(bus);
		confirm(bus, runId(day, 0), "Salma", "PICKED_UP");

		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", 1);
		assertRun(childrenOf(parentId), "Salma", "MORNING", "IN_PROGRESS", null);
		confirm(bus, runId(day, 0), "Rami", "PICKED_UP");
		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", 0);
	}

	@Test
	void theFirstChildOnTheRouteHasNoneLeftAtOnce() throws Exception {
		Bus bus = bus("Rami", "Salma");
		startMorning(bus);

		assertRun(childrenOf(parentId), "Rami", "MORNING", "IN_PROGRESS", 0);
		assertRun(childrenOf(parentId), "Salma", "MORNING", "IN_PROGRESS", 1);
	}

	@Test
	void thereIsNoCountForAChildAlreadyPickedUpNotPresentOrAbsent() throws Exception {
		Bus bus = bus("Dana", "Omar", "Rami", "Salma");
		String day = startMorning(bus);
		confirm(bus, runId(day, 0), "Omar", "PICKED_UP");
		confirm(bus, runId(day, 0), "Rami", "NOT_PRESENT");
		absent(bus.id("Salma"));

		String children = childrenOf(parentId);
		assertRun(children, "Omar", "MORNING", "IN_PROGRESS", null);
		assertRun(children, "Rami", "MORNING", "IN_PROGRESS", null);
		assertRun(children, "Salma", "MORNING", "IN_PROGRESS", null);
		assertRun(children, "Dana", "MORNING", "IN_PROGRESS", 0);
	}

	@Test
	void anAbsentChildTheDriverStillConfirmedHasNoCount() throws Exception {
		Bus bus = bus("Rami", "Tarek");
		String day = startMorning(bus);
		absent(bus.id("Tarek"));
		confirm(bus, runId(day, 0), "Tarek", "PICKED_UP");

		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", null);
	}

	@Test
	void aStudentRemovedFromTheRouteBeforeAnyConfirmationLeavesTheCount() throws Exception {
		Bus bus = bus("Rami", "Salma", "Tarek");
		startMorning(bus);
		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", 2);

		routeService.removeStudent(schoolId, bus.route().getId(), bus.id("Rami"));

		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", 1);
	}

	@Test
	void aStudentOnTheBusWhoLeftTheRouteIsLastAndNeverCountsAheadOfAChild() throws Exception {
		Bus bus = bus("Tarek", "Salma", "Rami");
		String day = driverDay(bus);
		act(bus, runId(day, 1), "start");
		// Afternoon order is Rami, Salma, Tarek. Rami is on the bus (picked up, not dropped off), so he is still to do.
		confirm(bus, runId(day, 1), "Rami", "PICKED_UP");
		assertRun(childrenOf(parentId), "Tarek", "AFTERNOON", "IN_PROGRESS", 2);

		leaveRoute(bus.id("Rami"));

		// Rami stays on the run but after the route's stops, so only Salma is ahead of Tarek now.
		assertRun(childrenOf(parentId), "Tarek", "AFTERNOON", "IN_PROGRESS", 1);
	}

	@Test
	void aReorderByTheHeadCanRaiseTheCount() throws Exception {
		Bus bus = bus("Tarek", "Rami", "Salma");
		startMorning(bus);
		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", 0);

		routeService.reorderStops(schoolId, bus.route().getId(),
				new ReorderStopsRequest(List.of(bus.id("Rami"), bus.id("Salma"), bus.id("Tarek"))));

		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", 2);
	}

	@Test
	void aChildWhoIsNotOnTheRosterAnyMoreHasNoCount() throws Exception {
		Bus bus = bus("Rami");
		startMorning(bus);

		// A child who left the route between the route lookup and the roster read: the run is shown, with no count.
		ChildRunResponse answer = runService.todayRunStatus(schoolId,
				List.of(new ChildOnRoute(UUID.randomUUID(), bus.route().getId()))).values().iterator().next();

		assertEquals(new ChildRunResponse(answer.direction(), answer.state(), null), answer);
		assertEquals("IN_PROGRESS", answer.state().name());
	}

	@Test
	void siblingsOnOneRouteEachGetTheirOwnCount() throws Exception {
		Bus bus = bus("Dana", "Omar", "Rami", "Salma");
		UUID other = UUID.randomUUID();
		for (String name : List.of("Dana", "Rami")) {
			Student student = studentRepository.findById(bus.id(name)).orElseThrow();
			student.setParentUserId(other);
			studentRepository.save(student);
		}
		startMorning(bus);

		// The parent has Omar (stop 2) and Salma (stop 4): one and three stops ahead of them.
		String children = childrenOf(parentId);
		assertRun(children, "Omar", "MORNING", "IN_PROGRESS", 1);
		assertRun(children, "Salma", "MORNING", "IN_PROGRESS", 3);
	}

	// ---- which run, and its state ----

	@Test
	void whenTheMorningRunIsOverAndNobodyOpenedTheAfternoonItShowsNotStarted() throws Exception {
		Bus bus = bus("Tarek");
		String day = startMorning(bus);
		act(bus, runId(day, 0), "end");
		runRepository.delete(runRepository.findById(UUID.fromString(runId(day, 1))).orElseThrow());

		assertRun(childrenOf(parentId), "Tarek", "AFTERNOON", "NOT_STARTED", null);
	}

	@Test
	void whenBothRunsAreOverTheAfternoonOneShowsFinished() throws Exception {
		Bus bus = bus("Tarek");
		String day = startMorning(bus);
		act(bus, runId(day, 0), "end");
		act(bus, runId(day, 1), "start");
		act(bus, runId(day, 1), "end");

		assertRun(childrenOf(parentId), "Tarek", "AFTERNOON", "FINISHED", null);
	}

	@Test
	void anAfternoonRunInProgressIsShownWhileTheMorningHasNotStarted() throws Exception {
		Bus bus = bus("Tarek", "Salma", "Rami");
		String day = driverDay(bus);
		act(bus, runId(day, 1), "start");
		// Afternoon order is Rami, Salma, Tarek. Rami is dropped off; Salma is on the bus but not dropped off yet.
		confirm(bus, runId(day, 1), "Rami", "PICKED_UP");
		confirm(bus, runId(day, 1), "Rami", "DROPPED_OFF");
		confirm(bus, runId(day, 1), "Salma", "PICKED_UP");

		String children = childrenOf(parentId);
		assertRun(children, "Tarek", "AFTERNOON", "IN_PROGRESS", 1);
		assertRun(children, "Rami", "AFTERNOON", "IN_PROGRESS", null);
		assertRun(children, "Salma", "AFTERNOON", "IN_PROGRESS", 0);
	}

	@Test
	void whenBothRunsAreInProgressTheMorningOneIsShown() throws Exception {
		Bus bus = bus("Tarek");
		String day = startMorning(bus);
		act(bus, runId(day, 1), "start");

		assertRun(childrenOf(parentId), "Tarek", "MORNING", "IN_PROGRESS", 0);
	}

	@Test
	void anAfternoonNotPresentStopIsDoneButAPickedUpOneIsNot() throws Exception {
		Bus bus = bus("Tarek", "Salma", "Rami");
		String day = driverDay(bus);
		act(bus, runId(day, 1), "start");
		// Afternoon order is Rami, Salma, Tarek.
		confirm(bus, runId(day, 1), "Rami", "NOT_PRESENT");
		confirm(bus, runId(day, 1), "Salma", "PICKED_UP");

		String children = childrenOf(parentId);
		assertRun(children, "Tarek", "AFTERNOON", "IN_PROGRESS", 1);
		assertRun(children, "Rami", "AFTERNOON", "IN_PROGRESS", null);
	}

	@Test
	void anAbsentStopIsSkippedOnTheAfternoonRunUntilTheDriverConfirmsIt() throws Exception {
		Bus bus = bus("Tarek", "Salma");
		String day = driverDay(bus);
		act(bus, runId(day, 1), "start");
		absent(bus.id("Salma"));

		// Afternoon order is Salma, Tarek. Salma is absent and unconfirmed: skipped, then confirmed: counts again.
		assertRun(childrenOf(parentId), "Tarek", "AFTERNOON", "IN_PROGRESS", 0);
		assertRun(childrenOf(parentId), "Salma", "AFTERNOON", "IN_PROGRESS", null);
		confirm(bus, runId(day, 1), "Salma", "PICKED_UP");
		assertRun(childrenOf(parentId), "Tarek", "AFTERNOON", "IN_PROGRESS", 1);
		assertRun(childrenOf(parentId), "Salma", "AFTERNOON", "IN_PROGRESS", 0);
	}

	@Test
	void childrenOnDifferentRoutesEachGetTheirOwnRunAndCount() throws Exception {
		Bus hamra = bus("Dana", "Tarek");
		Bus verdun = bus("Mira", "Layla");
		Bus achrafieh = bus("Zoe");
		startMorning(hamra);
		String verdunDay = startMorning(verdun);
		confirm(verdun, runId(verdunDay, 0), "Mira", "PICKED_UP");
		driverDay(achrafieh);

		String children = childrenOf(parentId);
		assertRun(children, "Dana", "MORNING", "IN_PROGRESS", 0);
		assertRun(children, "Tarek", "MORNING", "IN_PROGRESS", 1);
		assertRun(children, "Mira", "MORNING", "IN_PROGRESS", null);
		assertRun(children, "Layla", "MORNING", "IN_PROGRESS", 0);
		assertRun(children, "Zoe", "MORNING", "NOT_STARTED", null);
	}

	// ---- cost ----

	@Test
	void theNumberOfStatementsDoesNotGrowWithTheNumberOfChildren() throws Exception {
		UUID oneChild = UUID.randomUUID();
		UUID sixChildren = UUID.randomUUID();
		startMorning(bus(oneChild, "Ann"));
		startMorning(bus(sixChildren, "Ben", "Cal", "Dev", "Eli", "Fay", "Gus"));
		statementsFor(oneChild);
		statementsFor(sixChildren);

		long forOne = statementsFor(oneChild);
		assertTrue(forOne > 5, "statements are being counted: " + forOne);
		assertEquals(forOne, statementsFor(sixChildren));
	}

	// ---- ownership ----

	@Test
	void aParentSeesOnlyTheirOwnChildrenAndTheirOwnCountOnASharedBus() throws Exception {
		UUID parentB = UUID.randomUUID();
		Bus bus = bus("Rami", "Salma", "Tarek");
		// Salma belongs to parent B; parent A (the default) has Rami and Tarek.
		Student salma = studentRepository.findById(bus.id("Salma")).orElseThrow();
		salma.setParentUserId(parentB);
		studentRepository.save(salma);
		startMorning(bus);

		String a = childrenOf(parentId);
		String b = childrenOf(parentB);

		assertEquals(Set.of("Rami", "Tarek"), Set.copyOf(JsonPath.<List<String>>read(a, "$[*].firstName")));
		assertEquals(Set.of("Salma"), Set.copyOf(JsonPath.<List<String>>read(b, "$[*].firstName")));
		assertRun(a, "Tarek", "MORNING", "IN_PROGRESS", 2);
		assertRun(b, "Salma", "MORNING", "IN_PROGRESS", 1);
		assertFalse(b.contains(bus.id("Rami").toString()) || b.contains(bus.id("Tarek").toString()),
				"parent B's response must not mention A's children");
		assertFalse(a.contains(bus.id("Salma").toString()), "parent A's response must not mention B's child");
	}

	@Test
	void aParentOfAnotherSchoolGetsNothingEvenWithTheSameUserId() throws Exception {
		Bus bus = bus("Tarek");
		startMorning(bus);

		mockMvc.perform(get(URL).with(loggedIn(Role.PARENT, parentId, UUID.randomUUID())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$").isEmpty());
	}
}
