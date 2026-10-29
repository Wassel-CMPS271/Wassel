package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.MutableClock;
import com.wassel.backend.common.config.ClockConfig;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteProposalRepository;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.routes.repository.RouteVersionRepository;
import com.wassel.backend.runs.entity.Run;
import com.wassel.backend.runs.entity.RunState;
import com.wassel.backend.runs.repository.RunRepository;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-233: the driver's runs for today and the head of transportation's runs for a date, written from
 * docs/contracts/runs.md and the ticket. Everything is real: repositories, services and the PostgreSQL
 * schema from the Flyway migrations. Only the clock is moved (a {@link MutableClock}), so the date never
 * depends on the day the suite runs. The default "now" is Wednesday 2026-10-28, a school day.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(RunControllerTests.TestClock.class)
class RunControllerTests {

	private static final String DRIVER_URL = "/api/driver/runs/today";

	private static final String HEAD_URL = "/api/head-of-transport/runs";

	private static final Instant WEDNESDAY = Instant.parse("2026-10-28T08:00:00Z");

	private static final String WEDNESDAY_DATE = "2026-10-28";

	@TestConfiguration
	static class TestClock {

		@Bean
		@Primary
		MutableClock testClock() {
			return new MutableClock(WEDNESDAY, ClockConfig.SCHOOL_ZONE);
		}
	}

	private final UUID schoolA = UUID.randomUUID();

	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MutableClock clock;

	@Autowired
	private RunRepository runRepository;

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
	private SchoolSettingsRepository schoolSettingsRepository;

	@Autowired
	private HolidayRepository holidayRepository;

	@Autowired
	private HalfDayRepository halfDayRepository;

	@BeforeEach
	void cleanDatabase() {
		clock.set(WEDNESDAY);
		runRepository.deleteAll();
		proposalRepository.deleteAll();
		versionRepository.deleteAll();
		routeRepository.deleteAll();
		driverRepository.deleteAll();
		vehicleRepository.deleteAll();
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

	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		return loggedInAs(role, schoolId, UUID.randomUUID());
	}

	private void schoolTimes(UUID schoolId, String arrival, String dismissal) {
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(schoolId)
				.arrivalTime(arrival == null ? null : LocalTime.parse(arrival))
				.dismissalTime(dismissal == null ? null : LocalTime.parse(dismissal)).build());
	}

	/** A driver who can sign in: the driver record points at {@code userId}. */
	private Driver aDriver(UUID schoolId, UUID userId, String firstName) {
		return driverRepository.save(Driver.builder().schoolId(schoolId).userId(userId)
				.firstName(firstName).lastName("Barakat").phone("0" + (int) (Math.random() * 100000000))
				.email(UUID.randomUUID() + "@wassel.test").status(DriverStatus.ACTIVE).invitedAt(Instant.now())
				.build());
	}

	private Route aRoute(UUID schoolId, String name, Driver driver) {
		Vehicle vehicle = vehicleRepository.save(Vehicle.builder().schoolId(schoolId)
				.plateNumber("A " + (100000 + (int) (Math.random() * 900000))).capacity(14).active(true).build());
		return routeRepository.save(Route.builder().schoolId(schoolId).name(name)
				.vehicleId(vehicle.getId()).driverId(driver.getId()).build());
	}

	/** A student on the route at the given position, with a pin so the morning stops get arrival times. */
	private Student aStudent(UUID schoolId, Route route, int position, String firstName) {
		return studentRepository.save(Student.builder().schoolId(schoolId).firstName(firstName).lastName("Nasr")
				.grade("3").guardianName("Guardian " + firstName).guardianPhone("+961 3 " + (100000 + position))
				.status(StudentStatus.ACTIVE).address(position + " Hamra Street")
				.latitude(new BigDecimal("33.8" + (900 + position))).longitude(new BigDecimal("35.5" + (100 + position)))
				.routeId(route.getId()).stopPosition(position).build());
	}

	/** A signed-in driver with a route of three students: Rami, Salma, Tarek in that order. */
	private record Fixture(UUID userId, Driver driver, Route route) {
	}

	private Fixture driverWithRoute(UUID schoolId, String routeName) {
		UUID userId = UUID.randomUUID();
		Driver driver = aDriver(schoolId, userId, "Karim");
		Route route = aRoute(schoolId, routeName, driver);
		aStudent(schoolId, route, 1, "Rami");
		aStudent(schoolId, route, 2, "Salma");
		aStudent(schoolId, route, 3, "Tarek");
		return new Fixture(userId, driver, route);
	}

	private String driverToday(UUID schoolId, UUID userId) throws Exception {
		return mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolId, userId)))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
	}

	private String headRuns(UUID schoolId, String query) throws Exception {
		return mockMvc.perform(get(HEAD_URL + query).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId)))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
	}

	// ---- driver: today's runs ----

	@Test
	void aSchoolDayGivesTheMorningAndAfternoonRunWithEveryContractField() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.date").value(WEDNESDAY_DATE))
				.andExpect(jsonPath("$.dayType").value("SCHOOL_DAY"))
				.andExpect(jsonPath("$.runs.length()").value(2))
				.andExpect(jsonPath("$.runs[0].id").isNotEmpty())
				.andExpect(jsonPath("$.runs[0].date").value(WEDNESDAY_DATE))
				.andExpect(jsonPath("$.runs[0].direction").value("MORNING"))
				.andExpect(jsonPath("$.runs[0].state").value("NOT_STARTED"))
				.andExpect(jsonPath("$.runs[0].schoolTime").value("07:30"))
				.andExpect(jsonPath("$.runs[0].startedAt").doesNotExist())
				.andExpect(jsonPath("$.runs[0].endedAt").doesNotExist())
				.andExpect(jsonPath("$.runs[0].route.id").value(f.route().getId().toString()))
				.andExpect(jsonPath("$.runs[0].route.name").value("Hamra morning run"))
				.andExpect(jsonPath("$.runs[0].vehicle.id").value(f.route().getVehicleId().toString()))
				.andExpect(jsonPath("$.runs[0].vehicle.capacity").value(14))
				.andExpect(jsonPath("$.runs[0].vehicle.plateNumber").isNotEmpty())
				.andExpect(jsonPath("$.runs[0].driver.id").value(f.driver().getId().toString()))
				.andExpect(jsonPath("$.runs[0].driver.firstName").value("Karim"))
				.andExpect(jsonPath("$.runs[0].driver.lastName").value("Barakat"))
				.andExpect(jsonPath("$.runs[0].counts.students").value(3))
				.andExpect(jsonPath("$.runs[0].counts.absent").value(0))
				.andExpect(jsonPath("$.runs[0].counts.pickedUp").value(0))
				.andExpect(jsonPath("$.runs[0].counts.droppedOff").value(0))
				.andExpect(jsonPath("$.runs[0].counts.notPresent").value(0))
				.andExpect(jsonPath("$.runs[0].stops.length()").value(3))
				.andExpect(jsonPath("$.runs[0].stops[0].firstName").value("Rami"))
				.andExpect(jsonPath("$.runs[0].stops[0].position").value(1))
				.andExpect(jsonPath("$.runs[0].stops[0].lastName").value("Nasr"))
				.andExpect(jsonPath("$.runs[0].stops[0].address").value("1 Hamra Street"))
				.andExpect(jsonPath("$.runs[0].stops[0].latitude").value(33.8901))
				.andExpect(jsonPath("$.runs[0].stops[0].longitude").value(35.5101))
				.andExpect(jsonPath("$.runs[0].stops[0].arrivalTime").value(org.hamcrest.Matchers.matchesPattern("\\d\\d:\\d\\d")))
				.andExpect(jsonPath("$.runs[0].stops[0].guardianName").value("Guardian Rami"))
				.andExpect(jsonPath("$.runs[0].stops[0].guardianPhone").value("+961 3 100001"))
				.andExpect(jsonPath("$.runs[0].stops[0].absent").value(false))
				.andExpect(jsonPath("$.runs[0].stops[0].confirmation").doesNotExist())
				.andExpect(jsonPath("$.runs[1].direction").value("AFTERNOON"))
				.andExpect(jsonPath("$.runs[1].state").value("NOT_STARTED"))
				.andExpect(jsonPath("$.runs[1].schoolTime").value("14:30"));
	}

	@Test
	void theAfternoonRunIsTheMorningOrderReversedWithoutTimes() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.runs[1].stops[0].firstName").value("Tarek"))
				.andExpect(jsonPath("$.runs[1].stops[0].position").value(1))
				.andExpect(jsonPath("$.runs[1].stops[1].firstName").value("Salma"))
				.andExpect(jsonPath("$.runs[1].stops[1].position").value(2))
				.andExpect(jsonPath("$.runs[1].stops[2].firstName").value("Rami"))
				.andExpect(jsonPath("$.runs[1].stops[2].position").value(3))
				.andExpect(jsonPath("$.runs[1].stops[0].arrivalTime").doesNotExist())
				.andExpect(jsonPath("$.runs[1].stops[0].guardianName").value("Guardian Tarek"))
				.andExpect(jsonPath("$.runs[1].counts.students").value(3));
	}

	@Test
	void askingTwiceGivesTheSameRunsAndTwoRows() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");

		String first = driverToday(schoolA, f.userId());
		String second = driverToday(schoolA, f.userId());

		assertEquals((String) JsonPath.read(first, "$.runs[0].id"), JsonPath.read(second, "$.runs[0].id"));
		assertEquals((String) JsonPath.read(first, "$.runs[1].id"), JsonPath.read(second, "$.runs[1].id"));
		assertEquals(2, runRepository.count());
	}

	@Test
	void simultaneousRequestsFromDriversAndTheHeadCreateEachRunOnceAndAllSeeTheSameIds() throws Exception {
		List<Fixture> drivers = List.of(driverWithRoute(schoolA, "Hamra morning run"),
				driverWithRoute(schoolA, "Verdun morning run"), driverWithRoute(schoolA, "Achrafieh morning run"));
		int requests = 12;
		CountDownLatch start = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(requests);
		List<Future<String>> results = new ArrayList<>();
		try {
			for (int i = 0; i < requests; i++) {
				// Every third request is the head (all three routes), the rest are the three drivers in turn.
				Fixture driver = drivers.get(i % 3);
				boolean asHead = i % 3 == 0;
				results.add(pool.submit(() -> {
					start.await();
					var response = mockMvc.perform(asHead
									? get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
									: get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, driver.userId())))
							.andReturn().getResponse();
					assertEquals(200, response.getStatus(), response.getContentAsString());
					return response.getContentAsString();
				}));
			}
			start.countDown();
			Set<String> ids = new HashSet<>();
			for (Future<String> result : results) {
				List<String> runIds = JsonPath.read(result.get(), "$.runs[*].id");
				ids.addAll(runIds);
			}
			// Three routes, two runs each: every response named only those six ids.
			assertEquals(6, ids.size());
		} finally {
			pool.shutdownNow();
		}
		assertEquals(6, runRepository.count());
	}

	@Test
	void aCalendarHolidayHasNoRuns() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		holidayRepository.save(Holiday.builder().schoolId(schoolA).date(LocalDate.parse(WEDNESDAY_DATE))
				.name("Independence Day").build());

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.date").value(WEDNESDAY_DATE))
				.andExpect(jsonPath("$.dayType").value("HOLIDAY"))
				.andExpect(jsonPath("$.runs.length()").value(0));
		assertEquals(0, runRepository.count());
	}

	@ParameterizedTest
	@EnumSource(value = java.time.DayOfWeek.class, names = { "SATURDAY", "SUNDAY" })
	void aWeekendIsAHolidayEvenWhenItIsNotInTheCalendar(java.time.DayOfWeek day) throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		clock.set(day == java.time.DayOfWeek.SATURDAY ? Instant.parse("2026-10-31T08:00:00Z")
				: Instant.parse("2026-11-01T08:00:00Z"));

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.dayType").value("HOLIDAY"))
				.andExpect(jsonPath("$.runs.length()").value(0));
		assertEquals(0, runRepository.count());
	}

	@Test
	void aHalfDayAfternoonRunHasNoSchoolTimeButTheMorningKeepsIt() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		halfDayRepository.save(HalfDay.builder().schoolId(schoolA).date(LocalDate.parse(WEDNESDAY_DATE)).build());

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.dayType").value("HALF_DAY"))
				.andExpect(jsonPath("$.runs.length()").value(2))
				.andExpect(jsonPath("$.runs[0].schoolTime").value("07:30"))
				.andExpect(jsonPath("$.runs[1].schoolTime").doesNotExist());
	}

	@Test
	void schoolTimeIsNullWhenTheSchoolHasNotSetItsTimes() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.runs[0].schoolTime").doesNotExist())
				.andExpect(jsonPath("$.runs[1].schoolTime").doesNotExist())
				.andExpect(jsonPath("$.runs[0].stops[0].arrivalTime").doesNotExist());
	}

	@Test
	void aSignedInDriverWithoutADriverRecordHasNoRunsOnASchoolDay() throws Exception {
		driverWithRoute(schoolA, "Hamra morning run");

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.dayType").value("SCHOOL_DAY"))
				.andExpect(jsonPath("$.runs.length()").value(0));
		assertEquals(0, runRepository.count());
	}

	@Test
	void aDriverWithoutARouteHasNoRuns() throws Exception {
		UUID userId = UUID.randomUUID();
		aDriver(schoolA, userId, "Karim");

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, userId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.dayType").value("SCHOOL_DAY"))
				.andExpect(jsonPath("$.runs.length()").value(0));
		assertEquals(0, runRepository.count());
	}

	@Test
	void aDriverOfAnotherSchoolWithTheSameUserIdIsNotLinkedToTheDriver() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolB, f.userId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.runs.length()").value(0));
	}

	@Test
	void eachDriverSeesOnlyTheirOwnRoutesRuns() throws Exception {
		Fixture karim = driverWithRoute(schoolA, "Hamra morning run");
		UUID waleedUser = UUID.randomUUID();
		Route verdun = aRoute(schoolA, "Verdun morning run", aDriver(schoolA, waleedUser, "Walid"));
		aStudent(schoolA, verdun, 1, "Dana");

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, karim.userId())))
				.andExpect(jsonPath("$.runs.length()").value(2))
				.andExpect(jsonPath("$.runs[0].route.name").value("Hamra morning run"))
				.andExpect(jsonPath("$.runs[1].route.name").value("Hamra morning run"));
		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, waleedUser)))
				.andExpect(jsonPath("$.runs.length()").value(2))
				.andExpect(jsonPath("$.runs[0].route.name").value("Verdun morning run"))
				.andExpect(jsonPath("$.runs[0].counts.students").value(1))
				.andExpect(jsonPath("$.runs[0].stops[0].firstName").value("Dana"));
	}

	@Test
	void aRouteWithoutStudentsStillGetsTwoEmptyRuns() throws Exception {
		UUID userId = UUID.randomUUID();
		aRoute(schoolA, "Empty run", aDriver(schoolA, userId, "Karim"));

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, userId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.runs.length()").value(2))
				.andExpect(jsonPath("$.runs[0].counts.students").value(0))
				.andExpect(jsonPath("$.runs[0].stops.length()").value(0))
				.andExpect(jsonPath("$.runs[1].stops.length()").value(0));
	}

	@Test
	void aStudentAddedAfterTheRunsExistShowsOnTheNextFetch() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		driverToday(schoolA, f.userId());
		aStudent(schoolA, f.route(), 4, "Dana");

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].counts.students").value(4))
				.andExpect(jsonPath("$.runs[0].stops[3].firstName").value("Dana"))
				.andExpect(jsonPath("$.runs[1].stops[0].firstName").value("Dana"));
		assertEquals(2, runRepository.count());
	}

	@Test
	void aDriverSwappedOnTheRouteTakesOverTheSameRuns() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String before = driverToday(schoolA, f.userId());
		UUID otherUser = UUID.randomUUID();
		Driver other = aDriver(schoolA, otherUser, "Nadia");
		f.route().setDriverId(other.getId());
		routeRepository.save(f.route());

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs.length()").value(0));
		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, otherUser)))
				.andExpect(jsonPath("$.runs.length()").value(2))
				.andExpect(jsonPath("$.runs[0].id").value((String) JsonPath.read(before, "$.runs[0].id")))
				.andExpect(jsonPath("$.runs[0].driver.firstName").value("Nadia"));
	}

	@Test
	void todayIsTheDateInBeirutNotInUtc() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		// 22:30 UTC on Wednesday is already Thursday in Beirut.
		clock.set(Instant.parse("2026-10-28T22:30:00Z"));

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.date").value("2026-10-29"))
				.andExpect(jsonPath("$.runs[0].date").value("2026-10-29"));
	}

	@Test
	void theDriverEndpointNeedsASessionAndTheDriverRole() throws Exception {
		mockMvc.perform(get(DRIVER_URL)).andExpect(status().isUnauthorized());
		for (Role role : List.of(Role.HEAD_OF_TRANSPORT, Role.PARENT, Role.ADMIN)) {
			mockMvc.perform(get(DRIVER_URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden())
					.andExpect(jsonPath("$.detail").value("Access denied"));
		}
	}

	@Test
	void theResponseHasExactlyTheFieldsOfTheContractSamples() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String driver = driverToday(schoolA, f.userId());
		String head = headRuns(schoolA, "");
		String driverSample = Files.readString(Path.of("../docs/contracts/samples/runs/driver-today.json"));
		String headSample = Files.readString(Path.of("../docs/contracts/samples/runs/hot-runs.json"));

		assertEquals(keys(driverSample, "$"), keys(driver, "$"));
		assertEquals(keys(driverSample, "$.runs[0]"), keys(driver, "$.runs[0]"));
		assertEquals(keys(driverSample, "$.runs[0].route"), keys(driver, "$.runs[0].route"));
		assertEquals(keys(driverSample, "$.runs[0].vehicle"), keys(driver, "$.runs[0].vehicle"));
		assertEquals(keys(driverSample, "$.runs[0].driver"), keys(driver, "$.runs[0].driver"));
		assertEquals(keys(driverSample, "$.runs[0].counts"), keys(driver, "$.runs[0].counts"));
		assertEquals(keys(driverSample, "$.runs[0].stops[0]"), keys(driver, "$.runs[0].stops[0]"));
		assertEquals(keys(headSample, "$"), keys(head, "$"));
		assertEquals(keys(headSample, "$.runs[0]"), keys(head, "$.runs[0]"));
		// The samples write the nulls out; so must the server, not drop the keys.
		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].startedAt").value(nullValue()))
				.andExpect(jsonPath("$.runs[0].endedAt").value(nullValue()))
				.andExpect(jsonPath("$.runs[0].stops[0].confirmation").value(nullValue()))
				.andExpect(jsonPath("$.runs[1].stops[0].arrivalTime").value(nullValue()));
	}

	private Set<String> keys(String json, String path) {
		Map<String, Object> object = JsonPath.read(json, path);
		return object.keySet();
	}

	@Test
	void aReorderAndARemovalThroughTheRouteApiRenumberBothRuns() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		UUID userId = UUID.randomUUID();
		Route route = aRoute(schoolA, "Hamra morning run", aDriver(schoolA, userId, "Karim"));
		Student rami = aStudent(schoolA, route, 1, "Rami");
		Student salma = aStudent(schoolA, route, 2, "Salma");
		Student tarek = aStudent(schoolA, route, 3, "Tarek");
		driverToday(schoolA, userId);
		String routeUrl = "/api/head-of-transport/routes/" + route.getId();

		mockMvc.perform(put(routeUrl + "/stops").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"studentIds\":[\"%s\",\"%s\",\"%s\"]}".formatted(tarek.getId(), rami.getId(),
								salma.getId())))
				.andExpect(status().isOk());
		mockMvc.perform(delete(routeUrl + "/students/" + rami.getId()).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk());

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, userId)))
				.andExpect(jsonPath("$.runs[0].counts.students").value(2))
				.andExpect(jsonPath("$.runs[0].stops[0].studentId").value(tarek.getId().toString()))
				.andExpect(jsonPath("$.runs[0].stops[0].position").value(1))
				.andExpect(jsonPath("$.runs[0].stops[1].studentId").value(salma.getId().toString()))
				.andExpect(jsonPath("$.runs[0].stops[1].position").value(2))
				.andExpect(jsonPath("$.runs[0].stops[1].arrivalTime").value(org.hamcrest.Matchers.matchesPattern("\\d\\d:\\d\\d")))
				.andExpect(jsonPath("$.runs[1].stops[0].studentId").value(salma.getId().toString()))
				.andExpect(jsonPath("$.runs[1].stops[0].position").value(1))
				.andExpect(jsonPath("$.runs[1].stops[1].studentId").value(tarek.getId().toString()))
				.andExpect(jsonPath("$.runs[1].stops[1].position").value(2));
		assertEquals(2, runRepository.count());
	}

	@Test
	void aVehicleSwappedOnTheRouteShowsOnTheSameRuns() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String before = driverToday(schoolA, f.userId());
		Vehicle other = vehicleRepository.save(Vehicle.builder().schoolId(schoolA).plateNumber("Z 999999").capacity(20)
				.active(true).build());

		mockMvc.perform(put("/api/head-of-transport/routes/" + f.route().getId())
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)).contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"Hamra morning run\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}"
								.formatted(other.getId(), f.driver().getId())))
				.andExpect(status().isOk());

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].id").value((String) JsonPath.read(before, "$.runs[0].id")))
				.andExpect(jsonPath("$.runs[0].vehicle.plateNumber").value("Z 999999"))
				.andExpect(jsonPath("$.runs[0].vehicle.capacity").value(20));
	}

	@Test
	void aRouteDeletedThroughTheApiLeavesItsDriverWithNoRuns() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		driverToday(schoolA, f.userId());

		mockMvc.perform(delete("/api/head-of-transport/routes/" + f.route().getId())
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNoContent());

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.dayType").value("SCHOOL_DAY"))
				.andExpect(jsonPath("$.runs.length()").value(0));
		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.runs.length()").value(0));
	}

	@Test
	void aHolidayAddedAfterTheRunsExistHidesThemAndRemovingItBringsTheSameRunsBack() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String before = driverToday(schoolA, f.userId());
		Holiday holiday = holidayRepository.save(Holiday.builder().schoolId(schoolA)
				.date(LocalDate.parse(WEDNESDAY_DATE)).name("Snow day").build());

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.dayType").value("HOLIDAY"))
				.andExpect(jsonPath("$.runs.length()").value(0));
		holidayRepository.delete(holiday);

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].id").value((String) JsonPath.read(before, "$.runs[0].id")))
				.andExpect(jsonPath("$.runs[1].id").value((String) JsonPath.read(before, "$.runs[1].id")));
		assertEquals(2, runRepository.count());
	}

	// ---- head of transportation: runs for a date ----

	@Test
	void todaysRunsOfEveryRouteAreCreatedInRouteOrderMorningFirstWithoutStops() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		driverWithRoute(schoolA, "Hamra morning run");
		Route verdun = aRoute(schoolA, "Verdun morning run", aDriver(schoolA, UUID.randomUUID(), "Walid"));
		aStudent(schoolA, verdun, 1, "Dana");

		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.date").value(WEDNESDAY_DATE))
				.andExpect(jsonPath("$.dayType").value("SCHOOL_DAY"))
				.andExpect(jsonPath("$.runs.length()").value(4))
				.andExpect(jsonPath("$.runs[0].route.name").value("Hamra morning run"))
				.andExpect(jsonPath("$.runs[0].direction").value("MORNING"))
				.andExpect(jsonPath("$.runs[0].schoolTime").value("07:30"))
				.andExpect(jsonPath("$.runs[0].counts.students").value(3))
				.andExpect(jsonPath("$.runs[0].vehicle.capacity").value(14))
				.andExpect(jsonPath("$.runs[0].driver.firstName").value("Karim"))
				.andExpect(jsonPath("$.runs[0].state").value("NOT_STARTED"))
				.andExpect(jsonPath("$.runs[0].stops").doesNotExist())
				.andExpect(jsonPath("$.runs[1].route.name").value("Hamra morning run"))
				.andExpect(jsonPath("$.runs[1].direction").value("AFTERNOON"))
				.andExpect(jsonPath("$.runs[1].schoolTime").value("14:30"))
				.andExpect(jsonPath("$.runs[2].route.name").value("Verdun morning run"))
				.andExpect(jsonPath("$.runs[2].direction").value("MORNING"))
				.andExpect(jsonPath("$.runs[2].counts.students").value(1))
				.andExpect(jsonPath("$.runs[3].direction").value("AFTERNOON"));
		assertEquals(4, runRepository.count());
	}

	@Test
	void theHeadSeesTheSameRunsAsTheDriver() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String driver = driverToday(schoolA, f.userId());

		String head = headRuns(schoolA, "?date=" + WEDNESDAY_DATE);

		assertEquals((String) JsonPath.read(driver, "$.runs[0].id"), JsonPath.read(head, "$.runs[0].id"));
		assertEquals((String) JsonPath.read(driver, "$.runs[1].id"), JsonPath.read(head, "$.runs[1].id"));
		assertEquals(2, runRepository.count());
	}

	@Test
	void aRouteAddedAfterTheFirstRequestGetsItsRunsOnTheNextOne() throws Exception {
		driverWithRoute(schoolA, "Hamra morning run");
		headRuns(schoolA, "");
		aRoute(schoolA, "Verdun morning run", aDriver(schoolA, UUID.randomUUID(), "Walid"));

		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.runs.length()").value(4))
				.andExpect(jsonPath("$.runs[2].route.name").value("Verdun morning run"));
	}

	@Test
	void aPastDateShowsTheRunsThatExistAndNeverCreatesAny() throws Exception {
		driverWithRoute(schoolA, "Hamra morning run");
		headRuns(schoolA, "");
		clock.set(Instant.parse("2026-10-29T08:00:00Z"));

		mockMvc.perform(get(HEAD_URL + "?date=" + WEDNESDAY_DATE).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.date").value(WEDNESDAY_DATE))
				.andExpect(jsonPath("$.runs.length()").value(2));
		mockMvc.perform(get(HEAD_URL + "?date=2026-10-27").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.dayType").value("SCHOOL_DAY"))
				.andExpect(jsonPath("$.runs.length()").value(0));
		assertEquals(2, runRepository.count());
	}

	@Test
	void aFutureDateHasNoRunsAndCreatesNone() throws Exception {
		driverWithRoute(schoolA, "Hamra morning run");

		mockMvc.perform(get(HEAD_URL + "?date=2026-11-02").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.date").value("2026-11-02"))
				.andExpect(jsonPath("$.dayType").value("SCHOOL_DAY"))
				.andExpect(jsonPath("$.runs.length()").value(0));
		assertEquals(0, runRepository.count());
	}

	@Test
	void theDayTypeFollowsTheCalendarForAnyDate() throws Exception {
		holidayRepository.save(Holiday.builder().schoolId(schoolA).date(LocalDate.parse("2026-11-02"))
				.name("Holiday").build());
		halfDayRepository.save(HalfDay.builder().schoolId(schoolA).date(LocalDate.parse("2026-11-03")).build());

		assertEquals("HOLIDAY", JsonPath.read(headRuns(schoolA, "?date=2026-11-02"), "$.dayType"));
		assertEquals("HALF_DAY", JsonPath.read(headRuns(schoolA, "?date=2026-11-03"), "$.dayType"));
		assertEquals("SCHOOL_DAY", JsonPath.read(headRuns(schoolA, "?date=2026-11-04"), "$.dayType"));
		assertEquals("HOLIDAY", JsonPath.read(headRuns(schoolA, "?date=2026-11-07"), "$.dayType"));
		assertEquals("HOLIDAY", JsonPath.read(headRuns(schoolA, "?date=2026-11-08"), "$.dayType"));
		// Another school's calendar is not this school's.
		assertEquals("SCHOOL_DAY", JsonPath.read(headRuns(schoolB, "?date=2026-11-02"), "$.dayType"));
	}

	@Test
	void aHalfDayAfternoonRunHasNoSchoolTimeForTheHeadEither() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		driverWithRoute(schoolA, "Hamra morning run");
		halfDayRepository.save(HalfDay.builder().schoolId(schoolA).date(LocalDate.parse(WEDNESDAY_DATE)).build());

		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.dayType").value("HALF_DAY"))
				.andExpect(jsonPath("$.runs[0].schoolTime").value("07:30"))
				.andExpect(jsonPath("$.runs[1].schoolTime").value(nullValue()));
	}

	@Test
	void aHolidayTodayHasNoRunsForTheHead() throws Exception {
		driverWithRoute(schoolA, "Hamra morning run");
		holidayRepository.save(Holiday.builder().schoolId(schoolA).date(LocalDate.parse(WEDNESDAY_DATE))
				.name("Holiday").build());

		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.dayType").value("HOLIDAY"))
				.andExpect(jsonPath("$.runs.length()").value(0));
		assertEquals(0, runRepository.count());
	}

	@Test
	void theHeadOnlySeesTheirOwnSchoolsRuns() throws Exception {
		driverWithRoute(schoolA, "Hamra morning run");
		driverWithRoute(schoolB, "Beta morning run");

		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(jsonPath("$.runs.length()").value(2))
				.andExpect(jsonPath("$.runs[0].route.name").value("Beta morning run"));
		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, UUID.randomUUID())))
				.andExpect(jsonPath("$.runs.length()").value(0));
	}

	@Test
	void aDeletedRoutesRunsAreNoLongerListed() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		driverWithRoute(schoolA, "Verdun morning run");
		headRuns(schoolA, "");
		routeRepository.delete(f.route());

		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.runs.length()").value(2))
				.andExpect(jsonPath("$.runs[0].route.name").value("Verdun morning run"));
	}

	@Test
	void aDateThatIsNotADateIsABadRequest() throws Exception {
		mockMvc.perform(get(HEAD_URL + "?date=tomorrow").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Invalid request parameter"));
	}

	@Test
	void theHeadEndpointNeedsASessionAndTheHeadRole() throws Exception {
		mockMvc.perform(get(HEAD_URL)).andExpect(status().isUnauthorized());
		for (Role role : List.of(Role.DRIVER, Role.PARENT, Role.ADMIN)) {
			mockMvc.perform(get(HEAD_URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden())
					.andExpect(jsonPath("$.detail").value("Access denied"));
		}
	}

	// ---- SCRUM-234: start and end a run ----

	private static final String RUN_URL = "/api/driver/runs/";

	private String runId(String day, int index) {
		return JsonPath.read(day, "$.runs[" + index + "].id");
	}

	private ResultActions act(String action, String runId, UUID schoolId,
			UUID userId) throws Exception {
		return mockMvc.perform(post(RUN_URL + runId + "/" + action).with(loggedInAs(Role.DRIVER, schoolId, userId)));
	}

	private Run stored(String runId) {
		return runRepository.findById(UUID.fromString(runId)).orElseThrow();
	}

	@Test
	void startingARunSavesTheTimeAndAnswersWithTheWholeRun() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String day = driverToday(schoolA, f.userId());

		act("start", runId(day, 0), schoolA, f.userId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(runId(day, 0)))
				.andExpect(jsonPath("$.state").value("IN_PROGRESS"))
				.andExpect(jsonPath("$.startedAt").value("2026-10-28T08:00:00Z"))
				.andExpect(jsonPath("$.endedAt").value(nullValue()))
				.andExpect(jsonPath("$.direction").value("MORNING"))
				.andExpect(jsonPath("$.counts.students").value(3))
				.andExpect(jsonPath("$.stops.length()").value(3))
				.andExpect(jsonPath("$.stops[0].firstName").value("Rami"));

		Run run = stored(runId(day, 0));
		assertEquals(RunState.IN_PROGRESS, run.getState());
		assertEquals(WEDNESDAY, run.getStartedAt());
		assertEquals(RunState.NOT_STARTED, stored(runId(day, 1)).getState());
	}

	@Test
	void endingARunInProgressSavesTheTime() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		Fixture walid = driverWithRoute(schoolA, "Verdun morning run");
		String day = driverToday(schoolA, f.userId());
		String id = runId(day, 0);
		String walidRun = runId(driverToday(schoolA, walid.userId()), 0);
		act("start", id, schoolA, f.userId()).andExpect(status().isOk());
		act("start", runId(day, 1), schoolA, f.userId()).andExpect(status().isOk());
		act("start", walidRun, schoolA, walid.userId()).andExpect(status().isOk());
		clock.set(WEDNESDAY.plusSeconds(20 * 60));

		act("end", id, schoolA, f.userId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("FINISHED"))
				.andExpect(jsonPath("$.startedAt").value("2026-10-28T08:00:00Z"))
				.andExpect(jsonPath("$.endedAt").value("2026-10-28T08:20:00Z"))
				.andExpect(jsonPath("$.stops.length()").value(3));

		assertEquals(RunState.FINISHED, stored(id).getState());
		assertEquals(WEDNESDAY.plusSeconds(20 * 60), stored(id).getEndedAt());
		// Only that run: the driver's other run and another driver's run are still in progress.
		for (String other : List.of(runId(day, 1), walidRun)) {
			assertEquals(RunState.IN_PROGRESS, stored(other).getState());
			assertNull(stored(other).getEndedAt());
		}
	}

	@Test
	void aRepeatedStartAnswers200AndKeepsTheFirstTime() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, f.userId()), 0);
		act("start", id, schoolA, f.userId()).andExpect(status().isOk());
		clock.set(WEDNESDAY.plusSeconds(300));

		act("start", id, schoolA, f.userId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("IN_PROGRESS"))
				.andExpect(jsonPath("$.startedAt").value("2026-10-28T08:00:00Z"));
		assertEquals(WEDNESDAY, stored(id).getStartedAt());
	}

	@Test
	void aRepeatedEndAnswers200AndKeepsTheFirstTime() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, f.userId()), 0);
		act("start", id, schoolA, f.userId()).andExpect(status().isOk());
		clock.set(WEDNESDAY.plusSeconds(600));
		act("end", id, schoolA, f.userId()).andExpect(status().isOk());
		clock.set(WEDNESDAY.plusSeconds(900));

		act("end", id, schoolA, f.userId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("FINISHED"))
				.andExpect(jsonPath("$.endedAt").value("2026-10-28T08:10:00Z"));
		assertEquals(WEDNESDAY.plusSeconds(600), stored(id).getEndedAt());
	}

	@Test
	void startingAFinishedRunIs409AndNothingChanges() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, f.userId()), 0);
		act("start", id, schoolA, f.userId()).andExpect(status().isOk());
		act("end", id, schoolA, f.userId()).andExpect(status().isOk());
		clock.set(WEDNESDAY.plusSeconds(60));

		act("start", id, schoolA, f.userId())
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(containsString("FINISHED")));
		assertEquals(RunState.FINISHED, stored(id).getState());
		assertEquals(WEDNESDAY, stored(id).getStartedAt());
	}

	@Test
	void endingARunThatHasNotStartedIs409AndNothingChanges() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, f.userId()), 0);

		act("end", id, schoolA, f.userId())
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(containsString("NOT_STARTED")));
		assertEquals(RunState.NOT_STARTED, stored(id).getState());
		assertNull(stored(id).getEndedAt());
	}

	@ParameterizedTest
	@ValueSource(strings = { "start", "end" })
	void anotherDriversRunAnAnotherSchoolsRunAndAnUnknownRunAre404(String action) throws Exception {
		Fixture karim = driverWithRoute(schoolA, "Hamra morning run");
		Fixture walid = driverWithRoute(schoolA, "Verdun morning run");
		Fixture otherSchool = driverWithRoute(schoolB, "Elsewhere morning run");
		String walidRun = runId(driverToday(schoolA, walid.userId()), 0);
		String otherSchoolRun = runId(driverToday(schoolB, otherSchool.userId()), 0);
		act("start", walidRun, schoolA, walid.userId()).andExpect(status().isOk());
		act("start", otherSchoolRun, schoolB, otherSchool.userId()).andExpect(status().isOk());
		clock.set(WEDNESDAY.plusSeconds(60));

		act(action, walidRun, schoolA, karim.userId()).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail").exists());
		act(action, otherSchoolRun, schoolA, karim.userId()).andExpect(status().isNotFound());
		act(action, UUID.randomUUID().toString(), schoolA, karim.userId()).andExpect(status().isNotFound());
		for (String victim : List.of(walidRun, otherSchoolRun)) {
			assertEquals(RunState.IN_PROGRESS, stored(victim).getState());
			assertEquals(WEDNESDAY, stored(victim).getStartedAt());
			assertNull(stored(victim).getEndedAt());
		}
	}

	@Test
	void aDriverWithoutARouteOrWithoutADriverRecordGets404() throws Exception {
		Fixture karim = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, karim.userId()), 0);
		UUID noRoute = UUID.randomUUID();
		aDriver(schoolA, noRoute, "Nadia");

		act("start", id, schoolA, noRoute).andExpect(status().isNotFound());
		act("start", id, schoolA, UUID.randomUUID()).andExpect(status().isNotFound());
		assertEquals(RunState.NOT_STARTED, stored(id).getState());
	}

	@Test
	void aRunOfYesterdayCannotBeStartedOrEnded() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String day = driverToday(schoolA, f.userId());
		String notStarted = runId(day, 0);
		String started = runId(day, 1);
		act("start", started, schoolA, f.userId()).andExpect(status().isOk());
		// Thursday in Beirut: a stale screen still holds Wednesday's ids.
		clock.set(Instant.parse("2026-10-29T08:00:00Z"));

		act("start", notStarted, schoolA, f.userId()).andExpect(status().isNotFound());
		act("end", started, schoolA, f.userId()).andExpect(status().isNotFound());
		assertEquals(RunState.NOT_STARTED, stored(notStarted).getState());
		assertEquals(RunState.IN_PROGRESS, stored(started).getState());
		assertNull(stored(started).getEndedAt());
	}

	@Test
	void aHolidayAddedAfterTheRunsExistHidesThemFromStartAndEndToo() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String day = driverToday(schoolA, f.userId());
		String id = runId(day, 0);
		String started = runId(day, 1);
		act("start", started, schoolA, f.userId()).andExpect(status().isOk());
		Holiday holiday = holidayRepository.save(Holiday.builder().schoolId(schoolA)
				.date(LocalDate.parse(WEDNESDAY_DATE)).name("Snow day").build());

		act("start", id, schoolA, f.userId()).andExpect(status().isNotFound());
		act("end", started, schoolA, f.userId()).andExpect(status().isNotFound());
		assertEquals(RunState.NOT_STARTED, stored(id).getState());
		assertEquals(RunState.IN_PROGRESS, stored(started).getState());
		holidayRepository.delete(holiday);

		act("start", id, schoolA, f.userId()).andExpect(status().isOk());
	}

	@Test
	void startAndEndUseTodayInBeirutNotInUtc() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		// 22:30 UTC on Wednesday is already Thursday in Beirut: Thursday's runs are today's.
		clock.set(Instant.parse("2026-10-28T22:30:00Z"));
		String id = runId(driverToday(schoolA, f.userId()), 0);

		act("start", id, schoolA, f.userId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.date").value("2026-10-29"))
				.andExpect(jsonPath("$.startedAt").value("2026-10-28T22:30:00Z"));
		act("end", id, schoolA, f.userId()).andExpect(status().isOk());
	}

	@Test
	void theAfternoonRunCanStartBeforeTheMorningRun() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String day = driverToday(schoolA, f.userId());

		act("start", runId(day, 1), schoolA, f.userId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.direction").value("AFTERNOON"))
				.andExpect(jsonPath("$.state").value("IN_PROGRESS"))
				.andExpect(jsonPath("$.stops[0].firstName").value("Tarek"));
		assertEquals(RunState.NOT_STARTED, stored(runId(day, 0)).getState());
	}

	@Test
	void aHalfDayDoesNotStopARunStartingOrEnding() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		halfDayRepository.save(HalfDay.builder().schoolId(schoolA).date(LocalDate.parse(WEDNESDAY_DATE)).build());
		String day = driverToday(schoolA, f.userId());

		act("start", runId(day, 1), schoolA, f.userId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.schoolTime").doesNotExist());
		act("end", runId(day, 1), schoolA, f.userId()).andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("FINISHED"));
		act("start", runId(day, 0), schoolA, f.userId()).andExpect(status().isOk())
				.andExpect(jsonPath("$.schoolTime").value("07:30"));
	}

	@Test
	void aDriverSwappedOntoTheRouteCanEndTheRunTheOldDriverStarted() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, f.userId()), 0);
		act("start", id, schoolA, f.userId()).andExpect(status().isOk());
		UUID otherUser = UUID.randomUUID();
		Driver other = aDriver(schoolA, otherUser, "Nadia");
		f.route().setDriverId(other.getId());
		routeRepository.save(f.route());

		act("end", id, schoolA, f.userId()).andExpect(status().isNotFound());
		act("end", id, schoolA, otherUser).andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("FINISHED"))
				.andExpect(jsonPath("$.driver.firstName").value("Nadia"));
	}

	@Test
	void theHeadOfTransportationSeesTheStateAndTheTimesOfEachRun() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, f.userId()), 0);

		act("start", id, schoolA, f.userId()).andExpect(status().isOk());
		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.runs[0].id").value(id))
				.andExpect(jsonPath("$.runs[0].state").value("IN_PROGRESS"))
				.andExpect(jsonPath("$.runs[0].startedAt").value("2026-10-28T08:00:00Z"))
				.andExpect(jsonPath("$.runs[1].state").value("NOT_STARTED"));
		clock.set(WEDNESDAY.plusSeconds(1800));
		act("end", id, schoolA, f.userId()).andExpect(status().isOk());
		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.runs[0].state").value("FINISHED"))
				.andExpect(jsonPath("$.runs[0].endedAt").value("2026-10-28T08:30:00Z"));
	}

	@Test
	void theDriversNextFetchShowsTheNewState() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, f.userId()), 0);
		act("start", id, schoolA, f.userId()).andExpect(status().isOk());

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].state").value("IN_PROGRESS"))
				.andExpect(jsonPath("$.runs[0].startedAt").value("2026-10-28T08:00:00Z"))
				.andExpect(jsonPath("$.runs[1].state").value("NOT_STARTED"));
	}

	@Test
	void theStartAndEndAnswersHaveExactlyTheFieldsOfTheFinishedRunSample() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, f.userId()), 0);
		String sample = Files.readString(Path.of("../docs/contracts/samples/runs/run-finished.json"));

		String started = act("start", id, schoolA, f.userId()).andReturn().getResponse().getContentAsString();
		String ended = act("end", id, schoolA, f.userId()).andReturn().getResponse().getContentAsString();

		for (String answer : List.of(started, ended)) {
			for (String path : List.of("$", "$.route", "$.vehicle", "$.driver", "$.counts", "$.stops[0]")) {
				assertEquals(keys(sample, path), keys(answer, path), path);
			}
		}
	}

	@ParameterizedTest
	@ValueSource(strings = { "start", "end" })
	void startAndEndNeedASessionTheDriverRoleAndAValidId(String action) throws Exception {
		String path = RUN_URL + UUID.randomUUID() + "/" + action;
		mockMvc.perform(post(path)).andExpect(status().isUnauthorized());
		for (Role role : List.of(Role.HEAD_OF_TRANSPORT, Role.PARENT, Role.ADMIN)) {
			mockMvc.perform(post(path).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden())
					.andExpect(jsonPath("$.detail").value("Access denied"));
		}
		mockMvc.perform(post(RUN_URL + "not-a-uuid/" + action).with(loggedInAs(Role.DRIVER, schoolA)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Invalid request parameter"));
	}

	/**
	 * Twelve drivers' taps at once, with the clock ticking so a request that overwrote the first time would
	 * show a different one. Every answer must be 200 with the same time, and the row keeps it.
	 */
	@ParameterizedTest
	@ValueSource(strings = { "start", "end" })
	void simultaneousStartsOrEndsAnswer200AndKeepTheFirstTime(String action) throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		String id = runId(driverToday(schoolA, f.userId()), 0);
		if (action.equals("end")) {
			act("start", id, schoolA, f.userId()).andExpect(status().isOk());
		}
		int requests = 12;
		CountDownLatch go = new CountDownLatch(1);
		AtomicBoolean done = new AtomicBoolean();
		ExecutorService pool = Executors.newFixedThreadPool(requests + 1);
		pool.submit(() -> {
			for (long tick = 1; !done.get(); tick++) {
				clock.set(WEDNESDAY.plusMillis(tick * 7));
				Thread.sleep(1);
			}
			return null;
		});
		List<Future<String>> results = new ArrayList<>();
		try {
			for (int i = 0; i < requests; i++) {
				results.add(pool.submit(() -> {
					go.await();
					var response = mockMvc.perform(post(RUN_URL + id + "/" + action)
									.with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
							.andReturn().getResponse();
					assertEquals(200, response.getStatus(), response.getContentAsString());
					return JsonPath.read(response.getContentAsString(), action.equals("start")
							? "$.startedAt" : "$.endedAt");
				}));
			}
			go.countDown();
			Set<String> times = new HashSet<>();
			for (Future<String> result : results) {
				times.add(result.get());
			}
			assertEquals(1, times.size(), times.toString());
			Run run = stored(id);
			Instant saved = action.equals("start") ? run.getStartedAt() : run.getEndedAt();
			assertEquals(times.iterator().next(), saved.toString());
		} finally {
			done.set(true);
			pool.shutdownNow();
		}
		assertEquals(action.equals("start") ? RunState.IN_PROGRESS : RunState.FINISHED, stored(id).getState());
	}
}
