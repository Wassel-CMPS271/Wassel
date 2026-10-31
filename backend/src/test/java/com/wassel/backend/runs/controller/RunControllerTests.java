package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.absences.entity.Absence;
import com.wassel.backend.absences.repository.AbsenceRepository;
import com.wassel.backend.common.MutableClock;
import com.wassel.backend.common.config.ClockConfig;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteProposalRepository;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.routes.repository.RouteVersionRepository;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.routing.service.OpenRouteServiceTravelTimes;
import com.wassel.backend.routing.service.TravelTimes;
import com.wassel.backend.runs.entity.Run;
import com.wassel.backend.runs.entity.RunDirection;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
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
import org.springframework.transaction.support.TransactionSynchronizationManager;

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
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

	/** What the real travel times were doing when they were asked, for the review tests below. */
	private static final AtomicInteger travelTimeCalls = new AtomicInteger();

	private static volatile boolean travelTimesInTransaction;

	private static volatile Runnable whileTravelTimesRun = () -> {
	};

	@TestConfiguration
	static class TestClock {

		@Bean
		@Primary
		MutableClock testClock() {
			return new MutableClock(WEDNESDAY, ClockConfig.SCHOOL_ZONE);
		}

		/**
		 * Wraps the real road-time client (no key in the test profile, so straight-line times) to note, on each
		 * call, whether a transaction was open and to let a test change the route while the call is running.
		 */
		@Bean
		static BeanPostProcessor travelTimesProbe() {
			return new BeanPostProcessor() {
				@Override
				public Object postProcessAfterInitialization(Object bean, String beanName) {
					if (bean instanceof OpenRouteServiceTravelTimes real) {
						return (TravelTimes) points -> {
							travelTimeCalls.incrementAndGet();
							travelTimesInTransaction = TransactionSynchronizationManager.isActualTransactionActive();
							whileTravelTimesRun.run();
							return real.matrix(points);
						};
					}
					return bean;
				}
			};
		}
	}

	private final UUID schoolA = UUID.randomUUID();

	private final UUID schoolB = UUID.randomUUID();

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
		travelTimeCalls.set(0);
		travelTimesInTransaction = false;
		whileTravelTimesRun = () -> {
		};
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

	// ---- absences on the run (SCRUM-239) ----

	private Absence anAbsence(UUID schoolId, UUID studentId, LocalDate fromDate, LocalDate toDate) {
		return absenceRepository.saveAndFlush(Absence.builder().schoolId(schoolId).studentId(studentId)
				.fromDate(fromDate).toDate(toDate).createdBy(UUID.randomUUID()).build());
	}

	@Test
	void aStudentWithALiveAbsenceTodayIsMarkedAbsentOnBothRuns() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		Student salma = studentRepository.findBySchoolIdAndRouteIdOrderByStopPositionAsc(schoolA, f.route().getId())
				.get(1);
		anAbsence(schoolA, salma.getId(), LocalDate.parse(WEDNESDAY_DATE), LocalDate.parse(WEDNESDAY_DATE));

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].stops[1].firstName").value("Salma"))
				.andExpect(jsonPath("$.runs[0].stops[1].absent").value(true))
				.andExpect(jsonPath("$.runs[0].counts.absent").value(1))
				// The afternoon run is the same students reversed: an absence covers the whole day.
				.andExpect(jsonPath("$.runs[1].stops[1].firstName").value("Salma"))
				.andExpect(jsonPath("$.runs[1].stops[1].absent").value(true))
				.andExpect(jsonPath("$.runs[1].counts.absent").value(1))
				// Rami and Tarek are not absent.
				.andExpect(jsonPath("$.runs[0].stops[0].absent").value(false))
				.andExpect(jsonPath("$.runs[0].stops[2].absent").value(false));
	}

	@Test
	void aCancelledAbsenceDoesNotMarkTheStudentAbsent() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		Student rami = studentRepository.findBySchoolIdAndRouteIdOrderByStopPositionAsc(schoolA, f.route().getId())
				.get(0);
		Absence absence = anAbsence(schoolA, rami.getId(), LocalDate.parse(WEDNESDAY_DATE), LocalDate.parse(WEDNESDAY_DATE));
		absence.setCancelled(true);
		absenceRepository.saveAndFlush(absence);

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].stops[0].absent").value(false))
				.andExpect(jsonPath("$.runs[0].counts.absent").value(0));
	}

	@Test
	void anAbsenceThatDoesNotCoverTodayDoesNotMarkTheStudentAbsent() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		Student rami = studentRepository.findBySchoolIdAndRouteIdOrderByStopPositionAsc(schoolA, f.route().getId())
				.get(0);
		anAbsence(schoolA, rami.getId(), LocalDate.parse(WEDNESDAY_DATE).plusDays(1),
				LocalDate.parse(WEDNESDAY_DATE).plusDays(2));

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].stops[0].absent").value(false))
				.andExpect(jsonPath("$.runs[0].counts.absent").value(0));
	}

	@Test
	void anAbsenceReportedAfterTheRunStartedShowsOnTheNextFetch() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		driverToday(schoolA, f.userId());
		Student tarek = studentRepository.findBySchoolIdAndRouteIdOrderByStopPositionAsc(schoolA, f.route().getId())
				.get(2);

		anAbsence(schoolA, tarek.getId(), LocalDate.parse(WEDNESDAY_DATE), LocalDate.parse(WEDNESDAY_DATE));

		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].stops[2].firstName").value("Tarek"))
				.andExpect(jsonPath("$.runs[0].stops[2].absent").value(true));
		assertEquals(2, runRepository.count());
	}

	@Test
	void theHeadsRunsDayCountsStayZeroForAbsentSinceItDoesNotFetchStops() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		Student rami = studentRepository.findBySchoolIdAndRouteIdOrderByStopPositionAsc(schoolA, f.route().getId())
				.get(0);
		anAbsence(schoolA, rami.getId(), LocalDate.parse(WEDNESDAY_DATE), LocalDate.parse(WEDNESDAY_DATE));

		// A RunSummary (no stops) has nothing to compute the absent count from; the head of
		// transportation sees who is absent today through the absences module's own endpoint
		// instead (docs/contracts/runs.md: GET /api/head-of-transport/absences).
		mockMvc.perform(get(HEAD_URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.runs[0].stops").doesNotExist())
				.andExpect(jsonPath("$.runs[0].counts.absent").value(0));
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

	// ---- SCRUM-233 review: one read, no transaction around road times, nothing pulled from under a run ----

	@Test
	void theRoadTimesAreAskedForWithNoTransactionOpen() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");

		driverToday(schoolA, f.userId());

		assertTrue(travelTimeCalls.get() > 0, "the times were never asked for, so this test proves nothing");
		assertFalse(travelTimesInTransaction, "the driver's day held a database connection while waiting on road times");
	}

	@Test
	void aReorderWhileTheTimesAreWorkedOutCannotMixTheOrderWithTheTimes() throws Exception {
		schoolTimes(schoolA, "07:30", "14:30");
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		Student rami = studentRepository.findAll().stream().filter(student -> "Rami".equals(student.getFirstName()))
				.findFirst().orElseThrow();
		whileTravelTimesRun = () -> {
			rami.setStopPosition(9);
			studentRepository.save(rami);
		};

		String body = driverToday(schoolA, f.userId());

		// The reorder lands after the students were read, so this response is the order it read, with that
		// order's times: every stop later than the one before it.
		List<String> names = JsonPath.read(body, "$.runs[0].stops[*].firstName");
		List<String> times = JsonPath.read(body, "$.runs[0].stops[*].arrivalTime");
		assertEquals(List.of("Rami", "Salma", "Tarek"), names);
		assertEquals(times.stream().sorted().toList(), times);
		assertEquals(3, times.stream().distinct().count());
	}

	@Test
	void warmingTheTravelTimesAsksForEveryRoutesTimesWithNoTransactionOpen() {
		schoolTimes(schoolA, "07:30", "14:30");
		driverWithRoute(schoolA, "Hamra morning run");
		driverWithRoute(schoolA, "Verdun morning run");

		routeService.warmTravelTimes();

		assertEquals(2, travelTimeCalls.get());
		assertFalse(travelTimesInTransaction);
	}

	private void startTodaysMorningRun() {
		Run morning = runRepository.findAll().stream().filter(run -> run.getDirection() == RunDirection.MORNING)
				.findFirst().orElseThrow();
		morning.setState(RunState.IN_PROGRESS);
		runRepository.save(morning);
	}

	private ResultActions editRoute(Route route, String name, UUID vehicleId, UUID driverId) throws Exception {
		return mockMvc.perform(put("/api/head-of-transport/routes/" + route.getId())
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"%s\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}".formatted(name, vehicleId,
						driverId)));
	}

	@Test
	void theDriverCannotBeSwappedWhileTheRouteHasARunInProgressTodayAndNothingChanges() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		driverToday(schoolA, f.userId());
		startTodaysMorningRun();
		Driver other = aDriver(schoolA, UUID.randomUUID(), "Nadia");

		editRoute(f.route(), "Hamra morning run", f.route().getVehicleId(), other.getId())
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(
						"Route \"Hamra morning run\" has its morning run in progress. Change the driver or vehicle after it ends."));

		assertEquals(f.driver().getId(), routeRepository.findById(f.route().getId()).orElseThrow().getDriverId());
		mockMvc.perform(get(DRIVER_URL).with(loggedInAs(Role.DRIVER, schoolA, f.userId())))
				.andExpect(jsonPath("$.runs[0].state").value("IN_PROGRESS"));
	}

	@Test
	void theVehicleCannotBeSwappedWhileTheRouteHasARunInProgressToday() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		driverToday(schoolA, f.userId());
		startTodaysMorningRun();
		Vehicle other = vehicleRepository.save(Vehicle.builder().schoolId(schoolA).plateNumber("Z 999999").capacity(20)
				.active(true).build());

		editRoute(f.route(), "Hamra morning run", other.getId(), f.driver().getId())
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("in progress")));

		assertEquals(f.route().getVehicleId(), routeRepository.findById(f.route().getId()).orElseThrow().getVehicleId());
	}

	@Test
	void renamingARouteWithARunInProgressIsAllowed() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		driverToday(schoolA, f.userId());
		startTodaysMorningRun();

		editRoute(f.route(), "Hamra", f.route().getVehicleId(), f.driver().getId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Hamra"));
	}

	@Test
	void theDriverCanBeSwappedOnceTheRunHasEnded() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		driverToday(schoolA, f.userId());
		startTodaysMorningRun();
		Run morning = runRepository.findAll().stream().filter(run -> run.getState() == RunState.IN_PROGRESS)
				.findFirst().orElseThrow();
		morning.setState(RunState.FINISHED);
		runRepository.save(morning);
		Driver other = aDriver(schoolA, UUID.randomUUID(), "Nadia");

		editRoute(f.route(), "Hamra morning run", f.route().getVehicleId(), other.getId())
				.andExpect(status().isOk());
	}

	@Test
	void aRunLeftInProgressOnAnEarlierDateDoesNotFreezeTheRoute() throws Exception {
		Fixture f = driverWithRoute(schoolA, "Hamra morning run");
		runRepository.save(Run.builder().schoolId(schoolA).routeId(f.route().getId())
				.runDate(LocalDate.parse(WEDNESDAY_DATE).minusDays(1)).direction(RunDirection.MORNING)
				.state(RunState.IN_PROGRESS).startedAt(Instant.parse("2026-10-27T05:00:00Z")).build());
		Driver other = aDriver(schoolA, UUID.randomUUID(), "Nadia");

		editRoute(f.route(), "Hamra morning run", f.route().getVehicleId(), other.getId())
				.andExpect(status().isOk());
	}
}
