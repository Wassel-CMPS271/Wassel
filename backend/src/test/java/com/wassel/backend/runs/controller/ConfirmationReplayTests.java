package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.absences.repository.AbsenceRepository;
import com.wassel.backend.common.MutableClock;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteProposalRepository;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.routes.repository.RouteVersionRepository;
import com.wassel.backend.runs.entity.Confirmation;
import com.wassel.backend.runs.entity.ConfirmationKey;
import com.wassel.backend.runs.entity.ConfirmationStatus;
import com.wassel.backend.runs.entity.Run;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunState;
import com.wassel.backend.runs.repository.ConfirmationKeyRepository;
import com.wassel.backend.runs.repository.ConfirmationRepository;
import com.wassel.backend.runs.repository.RunRepository;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-263: replaying offline confirmations through {@code PUT .../confirmation} with a {@code clientRequestId},
 * written from docs/contracts/runs.md ("Offline replay") and its samples. Everything is real: repositories,
 * services, the filters and the PostgreSQL schema from the Flyway migrations; only the clock is moved. It shares
 * {@link RunControllerTests}' Spring context.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(RunControllerTests.TestClock.class)
class ConfirmationReplayTests {

	private static final Instant WEDNESDAY = Instant.parse("2026-10-28T08:00:00Z");

	private static final String RUN_URL = "/api/driver/runs/";

	private static final Path SAMPLES = Path.of("../docs/contracts/samples/runs/");

	private final UUID schoolA = UUID.randomUUID();

	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MutableClock clock;

	@Autowired
	private RunRepository runRepository;

	@Autowired
	private ConfirmationRepository confirmationRepository;

	@Autowired
	private ConfirmationKeyRepository keyRepository;

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Autowired
	private RouteRepository routeRepository;

	@Autowired
	private RouteProposalRepository proposalRepository;

	@Autowired
	private RouteVersionRepository versionRepository;

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

	@BeforeEach
	void cleanDatabase() {
		clock.set(WEDNESDAY);
		keyRepository.deleteAll();
		confirmationRepository.deleteAll();
		runRepository.deleteAll();
		proposalRepository.deleteAll();
		versionRepository.deleteAll();
		routeRepository.deleteAll();
		driverRepository.deleteAll();
		vehicleRepository.deleteAll();
		absenceRepository.deleteAll();
		studentRepository.deleteAll();
		schoolSettingsRepository.deleteAll();
		holidayRepository.deleteAll();
		halfDayRepository.deleteAll();
	}

	// ---- fixtures ----

	private RequestPostProcessor loggedInAs(Role role, UUID schoolId, UUID userId) {
		User user = User.builder().id(userId).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	/** A driver with a route of three students (Rami, Salma, Tarek) whose morning run is in progress. */
	private record Bus(UUID userId, Route route, String morning, String afternoon, UUID rami, UUID salma, UUID tarek) {
	}

	private Bus aBusInProgress(UUID schoolId, String routeName) throws Exception {
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(schoolId)
				.arrivalTime(LocalTime.parse("07:30")).dismissalTime(LocalTime.parse("14:30")).build());
		UUID userId = UUID.randomUUID();
		Driver driver = driverRepository.save(Driver.builder().schoolId(schoolId).userId(userId)
				.firstName("Karim").lastName("Barakat").phone("0" + (int) (Math.random() * 100000000))
				.email(UUID.randomUUID() + "@wassel.test").status(DriverStatus.ACTIVE).invitedAt(Instant.now()).build());
		Vehicle vehicle = vehicleRepository.save(Vehicle.builder().schoolId(schoolId)
				.plateNumber("A " + (100000 + (int) (Math.random() * 900000))).capacity(14).active(true).build());
		Route route = routeRepository.save(Route.builder().schoolId(schoolId).name(routeName)
				.vehicleId(vehicle.getId()).driverId(driver.getId()).build());
		for (int position = 1; position <= 3; position++) {
			studentRepository.save(Student.builder().schoolId(schoolId).firstName("Student" + position)
					.lastName("Nasr").grade("3").guardianName("Guardian").guardianPhone("+961 3 " + (100000 + position))
					.status(StudentStatus.ACTIVE).address(position + " Hamra Street")
					.latitude(new BigDecimal("33.8" + (900 + position))).longitude(new BigDecimal("35.5" + (100 + position)))
					.routeId(route.getId()).stopPosition(position).build());
		}
		String day = mockMvc.perform(get(RUN_URL + "today").with(loggedInAs(Role.DRIVER, schoolId, userId)))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		String morning = JsonPath.read(day, "$.runs[0].id");
		mockMvc.perform(post(RUN_URL + morning + "/start").with(loggedInAs(Role.DRIVER, schoolId, userId)))
				.andExpect(status().isOk());
		return new Bus(userId, route, morning, JsonPath.read(day, "$.runs[1].id"),
				stopId(day, 0), stopId(day, 1), stopId(day, 2));
	}

	private Bus aBusInProgress() throws Exception {
		return aBusInProgress(schoolA, "Hamra");
	}

	private static UUID stopId(String day, int index) {
		return UUID.fromString(JsonPath.read(day, "$.runs[0].stops[" + index + "].studentId"));
	}

	private ResultActions send(UUID schoolId, UUID userId, String runId, UUID studentId, String body) throws Exception {
		return mockMvc.perform(put(RUN_URL + runId + "/students/" + studentId + "/confirmation")
				.with(loggedInAs(Role.DRIVER, schoolId, userId)).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private static String body(String status, UUID key) {
		return "{\"status\":\"" + status + "\"" + (key == null ? "" : ",\"clientRequestId\":\"" + key + "\"") + "}";
	}

	private ResultActions confirmOn(Bus bus, String runId, UUID studentId, String status, UUID key) throws Exception {
		return send(schoolA, bus.userId(), runId, studentId, body(status, key));
	}

	private ResultActions confirm(Bus bus, UUID studentId, String status, UUID key) throws Exception {
		return confirmOn(bus, bus.morning(), studentId, status, key);
	}

	private void end(Bus bus) throws Exception {
		mockMvc.perform(post(RUN_URL + bus.morning() + "/end").with(loggedInAs(Role.DRIVER, schoolA, bus.userId())))
				.andExpect(status().isOk());
	}

	private long rowsOf(ConfirmationStatus status) {
		return confirmationRepository.findAll().stream().filter(row -> row.getStatus() == status).count();
	}

	private static Set<String> keys(String json) {
		Map<String, Object> object = JsonPath.read(json, "$");
		return object.keySet();
	}

	private List<MockHttpServletResponse> allAtOnce(List<Callable<MockHttpServletResponse>> jobs) throws Exception {
		CountDownLatch go = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(jobs.size());
		try {
			List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
			for (Callable<MockHttpServletResponse> job : jobs) {
				futures.add(pool.submit(() -> {
					go.await();
					return job.call();
				}));
			}
			go.countDown();
			List<MockHttpServletResponse> results = new ArrayList<>();
			for (Future<MockHttpServletResponse> future : futures) {
				results.add(future.get(30, TimeUnit.SECONDS));
			}
			return results;
		} finally {
			pool.shutdownNow();
		}
	}

	/**
	 * Holds the run row's lock in another transaction and does {@code whileHeld} in it, then sends the request. The
	 * request must still be waiting a second later; it is answered once the lock is let go, which is returned.
	 */
	private MockHttpServletResponse sentWhileRunLocked(String runId, Runnable whileHeld,
			Callable<MockHttpServletResponse> request) throws Exception {
		CountDownLatch locked = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			pool.submit(() -> transactionTemplate.execute(tx -> {
				runRepository.findLockedBySchoolIdAndId(schoolA, UUID.fromString(runId));
				whileHeld.run();
				locked.countDown();
				try {
					release.await();
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
				return null;
			}));
			assertTrue(locked.await(10, TimeUnit.SECONDS));
			Future<MockHttpServletResponse> sent = pool.submit(request);
			assertThrows(TimeoutException.class, () -> sent.get(1, TimeUnit.SECONDS));
			release.countDown();
			return sent.get(10, TimeUnit.SECONDS);
		} finally {
			release.countDown();
			pool.shutdownNow();
		}
	}

	// ---- the key table ----

	@Test
	void aSecondInsertOfTheSameDriversKeyAddsNothing() {
		UUID driver = UUID.randomUUID();
		UUID key = UUID.randomUUID();
		UUID run = UUID.randomUUID();
		UUID student = UUID.randomUUID();

		List<Integer> added = transactionTemplate.execute(tx -> List.of(
				keyRepository.insertIfMissing(schoolA, driver, key, run, student, "PICKED_UP", WEDNESDAY),
				keyRepository.insertIfMissing(schoolA, driver, key, run, student, "PICKED_UP", WEDNESDAY),
				keyRepository.insertIfMissing(schoolA, UUID.randomUUID(), key, run, student, "PICKED_UP", WEDNESDAY)));

		assertEquals(List.of(1, 0, 1), added, "a second insert adds nothing; keys are scoped to one driver");
		ConfirmationKey stored = keyRepository.findBySchoolIdAndDriverUserIdAndClientRequestId(schoolA, driver, key)
				.orElseThrow();
		assertEquals(student, stored.getStudentId());
		assertEquals(ConfirmationStatus.PICKED_UP, stored.getStatus());
	}

	// ---- the request ----

	@Test
	void theContractSampleBodyIsAccepted() throws Exception {
		Bus bus = aBusInProgress();
		String sample = Files.readString(SAMPLES.resolve("confirmation-request.json"));
		String sentStatus = JsonPath.read(sample, "$.status");

		send(schoolA, bus.userId(), bus.morning(), bus.rami(), sample)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.stops[0].confirmation.status").value(sentStatus));

		assertEquals(1, keyRepository.count());
		assertEquals(UUID.fromString(JsonPath.read(sample, "$.clientRequestId")),
				keyRepository.findAll().get(0).getClientRequestId());
	}

	@ParameterizedTest
	@ValueSource(strings = { "\"not-a-uuid\"", "123", "\"\"", "\"   \"", "\"1-1-1-1-1\"",
			"\"6f1c2a4e8b3d4e5f9a7b1c2d3e4f5a6\"", "true", "{}" })
	void aClientRequestIdThatIsNotAUuidIs400AndStoresNothing(String value) throws Exception {
		Bus bus = aBusInProgress();

		send(schoolA, bus.userId(), bus.morning(), bus.rami(), "{\"status\":\"PICKED_UP\",\"clientRequestId\":" + value + "}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Malformed request body"));

		assertEquals(0, confirmationRepository.count());
		assertEquals(0, keyRepository.count());
	}

	@Test
	void anExplicitNullKeyIsNoKeyAndAnUppercaseKeyIsTheSameKeyAsItsLowercase() throws Exception {
		Bus bus = aBusInProgress();
		UUID key = UUID.randomUUID();

		send(schoolA, bus.userId(), bus.morning(), bus.rami(), "{\"status\":\"PICKED_UP\",\"clientRequestId\":null}")
				.andExpect(status().isOk());
		assertEquals(0, keyRepository.count());

		send(schoolA, bus.userId(), bus.morning(), bus.salma(),
				"{\"status\":\"PICKED_UP\",\"clientRequestId\":\"" + key.toString().toUpperCase() + "\"}")
				.andExpect(status().isOk());
		confirm(bus, bus.salma(), "PICKED_UP", key).andExpect(status().isOk());
		confirm(bus, bus.tarek(), "PICKED_UP", key).andExpect(status().isUnprocessableEntity());

		assertEquals(1, keyRepository.count());
		assertEquals(2, confirmationRepository.count());
	}

	@Test
	void aRequestWithNoKeyStoresNoKey() throws Exception {
		Bus bus = aBusInProgress();

		confirm(bus, bus.rami(), "PICKED_UP", null).andExpect(status().isOk());
		confirm(bus, bus.rami(), "PICKED_UP", null).andExpect(status().isOk());

		assertEquals(1, confirmationRepository.count());
		assertEquals(0, keyRepository.count());
	}

	// ---- one business effect ----

	@Test
	void theSameKeyResentIsOneEffectAndKeepsTheFirstTime() throws Exception {
		Bus bus = aBusInProgress();
		UUID key = UUID.randomUUID();
		confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isOk());
		Instant first = confirmationRepository.findAll().get(0).getConfirmedAt();
		clock.set(WEDNESDAY.plusSeconds(60));

		for (int i = 0; i < 3; i++) {
			confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isOk())
					.andExpect(jsonPath("$.counts.pickedUp").value(1));
		}

		List<Confirmation> rows = confirmationRepository.findAll();
		assertEquals(1, rows.size());
		assertEquals(first, rows.get(0).getConfirmedAt());
		assertEquals(1, keyRepository.count());
	}

	@Test
	void aRecordedKeyIsStillAnsweredAfterTheRunEndedButANewKeyIs409() throws Exception {
		Bus bus = aBusInProgress();
		UUID key = UUID.randomUUID();
		confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isOk());
		end(bus);

		confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("FINISHED"))
				.andExpect(jsonPath("$.stops[0].confirmation.status").value("PICKED_UP"));
		confirm(bus, bus.salma(), "PICKED_UP", UUID.randomUUID()).andExpect(status().isConflict());

		assertEquals(1, confirmationRepository.count());
		assertEquals(1, keyRepository.count());
	}

	@Test
	void aRetryAfterALaterStatusIs200AndTheStopKeepsTheLaterStatus() throws Exception {
		Bus bus = aBusInProgress();
		UUID pickup = UUID.randomUUID();
		confirm(bus, bus.rami(), "PICKED_UP", pickup).andExpect(status().isOk());
		confirm(bus, bus.rami(), "DROPPED_OFF", UUID.randomUUID()).andExpect(status().isOk());

		confirm(bus, bus.rami(), "PICKED_UP", pickup).andExpect(status().isOk())
				.andExpect(jsonPath("$.stops[0].confirmation.status").value("DROPPED_OFF"));

		assertEquals(2, confirmationRepository.count());
	}

	@Test
	void aDoubleTapOfflineMakesTwoKeysOneConfirmationAndBothKeysKeepAnswering() throws Exception {
		Bus bus = aBusInProgress();
		UUID first = UUID.randomUUID();
		UUID second = UUID.randomUUID();

		confirm(bus, bus.rami(), "PICKED_UP", first).andExpect(status().isOk());
		confirm(bus, bus.rami(), "PICKED_UP", second).andExpect(status().isOk());
		end(bus);

		confirm(bus, bus.rami(), "PICKED_UP", second).andExpect(status().isOk());
		assertEquals(1, confirmationRepository.count());
		assertEquals(2, keyRepository.count());
	}

	// ---- a reused key ----

	@Test
	void aKeyReusedForADifferentConfirmationIs422AndWritesNothing() throws Exception {
		Bus bus = aBusInProgress();
		UUID key = UUID.randomUUID();
		confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isOk());
		String sample = Files.readString(SAMPLES.resolve("confirmation-key-reused.json"));

		String answer = confirm(bus, bus.salma(), "PICKED_UP", key).andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.title").value(JsonPath.<String>read(sample, "$.title")))
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString(key.toString())))
				.andReturn().getResponse().getContentAsString();
		confirm(bus, bus.rami(), "DROPPED_OFF", key).andExpect(status().isUnprocessableEntity());
		confirmOn(bus, bus.afternoon(), bus.rami(), "PICKED_UP", key).andExpect(status().isUnprocessableEntity());

		assertEquals(keys(sample), keys(answer));
		assertEquals(1, confirmationRepository.count());
		assertEquals(1, keyRepository.count());
	}

	@Test
	void aKeyReusedForADifferentConfirmationAfterEndRunIs422NotTheStateConflict() throws Exception {
		Bus bus = aBusInProgress();
		UUID key = UUID.randomUUID();
		confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isOk());
		end(bus);

		confirm(bus, bus.salma(), "PICKED_UP", key).andExpect(status().isUnprocessableEntity());
		confirm(bus, bus.salma(), "PICKED_UP", UUID.randomUUID()).andExpect(status().isConflict());

		assertEquals(1, confirmationRepository.count());
		assertEquals(1, keyRepository.count());
	}

	@Test
	void aRefusedRequestStoresNoKeyAndItsRetryIsJudgedAgainstTheStateThen() throws Exception {
		Bus bus = aBusInProgress();
		UUID key = UUID.randomUUID();

		confirm(bus, bus.rami(), "DROPPED_OFF", key).andExpect(status().isConflict());
		assertEquals(0, keyRepository.count());

		confirm(bus, bus.rami(), "PICKED_UP", UUID.randomUUID()).andExpect(status().isOk());
		confirm(bus, bus.rami(), "DROPPED_OFF", key).andExpect(status().isOk());

		assertEquals(2, keyRepository.count());
		assertEquals(1, rowsOf(ConfirmationStatus.DROPPED_OFF));
	}

	// ---- who may replay ----

	@Test
	void aKeyedRequestOnARunThatIsNotTheDriversTodayIs404WithTheSameDetailAndStoresNoKey() throws Exception {
		Bus bus = aBusInProgress();
		Bus other = aBusInProgress(schoolA, "Verdun");
		Bus foreign = aBusInProgress(schoolB, "Achrafieh");
		Run yesterday = runRepository.save(Run.builder().schoolId(schoolA).routeId(bus.route().getId())
				.runDate(LocalDate.parse("2026-10-27")).direction(RunDirection.MORNING).state(RunState.IN_PROGRESS)
				.build());
		UUID key = UUID.randomUUID();
		Set<String> details = new HashSet<>();

		for (ResultActions attempt : List.of(
				send(schoolA, bus.userId(), other.morning(), other.rami(), body("PICKED_UP", key)),
				send(schoolA, bus.userId(), foreign.morning(), foreign.rami(), body("PICKED_UP", key)),
				send(schoolA, bus.userId(), UUID.randomUUID().toString(), bus.rami(), body("PICKED_UP", key)),
				send(schoolA, bus.userId(), yesterday.getId().toString(), bus.rami(), body("PICKED_UP", key)))) {
			details.add(attempt.andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString());
		}

		assertEquals(1, details.stream().map(text -> JsonPath.<String>read(text, "$.detail")).distinct().count());
		assertEquals(0, keyRepository.count());
		assertEquals(0, confirmationRepository.count());
	}

	@Test
	void aStudentNotOnTheRunIs404AndAnotherDriversKeyValueIsTheirOwn() throws Exception {
		Bus bus = aBusInProgress();
		Bus other = aBusInProgress(schoolA, "Verdun");
		UUID key = UUID.randomUUID();
		confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isOk());

		confirm(bus, UUID.randomUUID(), "PICKED_UP", UUID.randomUUID()).andExpect(status().isNotFound());
		send(schoolA, other.userId(), other.morning(), other.rami(), body("PICKED_UP", key)).andExpect(status().isOk());

		assertEquals(2, keyRepository.count());
		assertEquals(2, confirmationRepository.count());
	}

	@Test
	void aRecordedKeyIs404OnceTheRouteBelongsToAnotherDriver() throws Exception {
		Bus bus = aBusInProgress();
		UUID key = UUID.randomUUID();
		confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isOk());
		Driver other = driverRepository.save(Driver.builder().schoolId(schoolA).userId(UUID.randomUUID())
				.firstName("Nadia").lastName("Barakat").phone("0" + (int) (Math.random() * 100000000))
				.email(UUID.randomUUID() + "@wassel.test").status(DriverStatus.ACTIVE).invitedAt(Instant.now()).build());
		Route route = routeRepository.findById(bus.route().getId()).orElseThrow();
		route.setDriverId(other.getId());
		routeRepository.save(route);

		confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail").value("Run not found"));

		assertEquals(1, keyRepository.count());
		assertEquals(1, confirmationRepository.count());
	}

	@ParameterizedTest
	@EnumSource(value = Role.class, names = { "HEAD_OF_TRANSPORT", "ADMIN", "PARENT" })
	void anotherRoleIs403(Role role) throws Exception {
		Bus bus = aBusInProgress();

		mockMvc.perform(put(RUN_URL + bus.morning() + "/students/" + bus.rami() + "/confirmation")
						.with(loggedInAs(role, schoolA, UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
						.content(body("PICKED_UP", UUID.randomUUID())))
				.andExpect(status().isForbidden());

		assertEquals(0, keyRepository.count());
	}

	@Test
	void signedOutIs401() throws Exception {
		Bus bus = aBusInProgress();

		mockMvc.perform(put(RUN_URL + bus.morning() + "/students/" + bus.rami() + "/confirmation")
						.contentType(MediaType.APPLICATION_JSON).content(body("PICKED_UP", UUID.randomUUID())))
				.andExpect(status().isUnauthorized());

		assertEquals(0, keyRepository.count());
		assertEquals(0, confirmationRepository.count());
	}

	// ---- concurrency on PostgreSQL ----

	@Test
	void twentySimultaneousCopiesOfOneKeyedRequestAreAll200WithOneConfirmationAndOneKey() throws Exception {
		Bus bus = aBusInProgress();
		UUID key = UUID.randomUUID();
		List<Callable<MockHttpServletResponse>> jobs = new ArrayList<>();
		for (int i = 0; i < 20; i++) {
			jobs.add(() -> confirm(bus, bus.rami(), "PICKED_UP", key).andReturn().getResponse());
		}

		for (MockHttpServletResponse response : allAtOnce(jobs)) {
			assertEquals(200, response.getStatus(), response.getContentAsString());
		}

		assertEquals(1, confirmationRepository.count());
		assertEquals(1, keyRepository.count());
	}

	/** The run lock does not serialise two runs, so the key's unique constraint must decide which request wins. */
	@Test
	void oneKeySentAtOnceForTwoRunsOfTheDriverIsOne200AndThe422sNeverA500() throws Exception {
		Bus bus = aBusInProgress();
		mockMvc.perform(post(RUN_URL + bus.afternoon() + "/start").with(loggedInAs(Role.DRIVER, schoolA, bus.userId())))
				.andExpect(status().isOk());
		UUID key = UUID.randomUUID();
		List<Callable<MockHttpServletResponse>> jobs = new ArrayList<>();
		for (int i = 0; i < 5; i++) {
			jobs.add(() -> confirmOn(bus, bus.morning(), bus.rami(), "PICKED_UP", key).andReturn().getResponse());
			jobs.add(() -> confirmOn(bus, bus.afternoon(), bus.rami(), "PICKED_UP", key).andReturn().getResponse());
		}

		List<MockHttpServletResponse> responses = allAtOnce(jobs);

		Set<String> winners = new HashSet<>();
		for (int i = 0; i < responses.size(); i++) {
			int code = responses.get(i).getStatus();
			assertTrue(code == 200 || code == 422, code + " " + responses.get(i).getContentAsString());
			if (code == 200) {
				winners.add(i % 2 == 0 ? "morning" : "afternoon");
			}
		}
		assertEquals(1, winners.size(), "only one run's confirmation may use the key");
		assertEquals(1, keyRepository.count());
		assertEquals(1, confirmationRepository.count());
		Confirmation stored = confirmationRepository.findAll().get(0);
		assertEquals(keyRepository.findAll().get(0).getRunId(), stored.getRunId());
	}

	@Test
	void aRecordedKeyThatWaitedForTheRunToEndStillAnswers200() throws Exception {
		Bus bus = aBusInProgress();
		UUID key = UUID.randomUUID();
		UUID morning = UUID.fromString(bus.morning());
		confirm(bus, bus.rami(), "PICKED_UP", key).andExpect(status().isOk());

		MockHttpServletResponse answer = sentWhileRunLocked(bus.morning(),
				() -> runRepository.markEnded(schoolA, morning, WEDNESDAY),
				() -> confirm(bus, bus.rami(), "PICKED_UP", key).andReturn().getResponse());

		assertEquals(200, answer.getStatus(), answer.getContentAsString());
		assertEquals(1, confirmationRepository.count());
	}
}
