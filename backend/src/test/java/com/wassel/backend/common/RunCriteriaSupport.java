package com.wassel.backend.common;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.config.ClockConfig;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
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
import com.wassel.backend.users.repository.UserRepository;
import com.wassel.backend.vehicles.entity.Vehicle;
import com.wassel.backend.vehicles.repository.VehicleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Fixtures for SCRUM-242, the independent tests of the daily runs (SCRUM-233), start and end (234), confirmations
 * (235) and the parent's run status (237). Written from {@code docs/contracts/runs.md} and the tickets' acceptance
 * criteria, not from {@code RunControllerTests} or {@code ParentRunStatusTests} (the author's suites) or the runs code.
 *
 * <p>Each test gets its own school, so tests never see each other's rows. "Today" is a Wednesday at 07:00 in Beirut;
 * tests move the clock to reach a weekend, the next day or a later time. Everything a head of transportation, driver or
 * parent does goes through the HTTP API; only what has no endpoint (accounts, the calendar, a pin) is saved directly.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(RunCriteriaSupport.TestClock.class)
public abstract class RunCriteriaSupport {

	/** Wednesday 2026-11-04, 07:00 in Beirut (UTC+2 in November). */
	protected static final Instant WEDNESDAY_7AM = Instant.parse("2026-11-04T05:00:00Z");

	protected static final LocalDate WEDNESDAY = LocalDate.of(2026, 11, 4);

	protected static final String DRIVER_TODAY = "/api/driver/runs/today";

	protected static final String HEAD_RUNS = "/api/head-of-transport/runs";

	protected static final String ROUTES = "/api/head-of-transport/routes";

	private static final AtomicInteger UNIQUE = new AtomicInteger();

	@TestConfiguration
	public static class TestClock {

		@Bean
		@Primary
		MutableClock runCriteriaClock() {
			return new MutableClock(WEDNESDAY_7AM, ClockConfig.SCHOOL_ZONE);
		}
	}

	@Autowired
	protected MockMvc mockMvc;

	@Autowired
	protected MutableClock clock;

	@Autowired
	protected UserRepository userRepository;

	@Autowired
	protected VehicleRepository vehicleRepository;

	@Autowired
	protected DriverRepository driverRepository;

	@Autowired
	protected StudentRepository studentRepository;

	@Autowired
	protected SchoolSettingsRepository schoolSettingsRepository;

	@Autowired
	protected HolidayRepository holidayRepository;

	@Autowired
	protected HalfDayRepository halfDayRepository;

	protected UUID school;

	@BeforeEach
	void aFreshSchoolOnWednesdayMorning() {
		clock.set(WEDNESDAY_7AM);
		school = UUID.randomUUID();
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(school)
				.arrivalTime(LocalTime.of(7, 30)).dismissalTime(LocalTime.of(14, 0)).build());
	}

	// ---------------------------------------------------------------- who is signed in

	protected RequestPostProcessor as(Role role, UUID userId) {
		return as(role, userId, school);
	}

	protected RequestPostProcessor as(Role role, UUID userId, UUID schoolId) {
		User user = User.builder().id(userId).email(userId + "@wassel.test").passwordHash("x").role(role)
				.schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	protected RequestPostProcessor head() {
		return as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID());
	}

	// ---------------------------------------------------------------- the school's data

	/** A driver: their sign-in account and the driver record linked to it. */
	protected record Bus(UUID driverUserId, UUID driverId, UUID vehicleId, String routeId) {
	}

	protected UUID aDriverAccount() {
		return userRepository.save(User.builder().email("driver-" + UUID.randomUUID() + "@wassel.test")
				.passwordHash("x").role(Role.DRIVER).schoolId(school).build()).getId();
	}

	protected UUID aDriverRecord(UUID userId) {
		int n = UNIQUE.incrementAndGet();
		return driverRepository.save(Driver.builder().schoolId(school).firstName("Karim").lastName("Haddad")
				.phone("+961 3 " + (100000 + n)).email("d" + n + "-" + UUID.randomUUID() + "@wassel.test")
				.status(DriverStatus.ACTIVE).invitedAt(Instant.now()).userId(userId).build()).getId();
	}

	protected UUID aVehicle() {
		int n = UNIQUE.incrementAndGet();
		return vehicleRepository.save(Vehicle.builder().schoolId(school).plateNumber("A " + (100000 + n))
				.capacity(14).active(true).build()).getId();
	}

	/** A route created by the head of transportation, with its own vehicle and a signed-in driver. */
	protected Bus aBus(String routeName) throws Exception {
		UUID driverUser = aDriverAccount();
		UUID driver = aDriverRecord(driverUser);
		UUID vehicle = aVehicle();
		String body = mockMvc.perform(post(ROUTES).with(head()).contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"%s\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}".formatted(routeName, vehicle,
								driver)))
				.andReturn().getResponse().getContentAsString();
		return new Bus(driverUser, driver, vehicle, JsonPath.read(body, "$.id"));
	}

	/** An active student with a pin a little north-east of the school, and an optional parent. */
	protected UUID aStudent(String firstName, UUID parentUserId) {
		int n = UNIQUE.incrementAndGet();
		return studentRepository.save(Student.builder().schoolId(school).firstName(firstName).lastName("Nasr")
				.grade("4").guardianName("Guardian of " + firstName).guardianPhone("+961 3 " + (500000 + n))
				.status(StudentStatus.ACTIVE).address(firstName + " Street, Beirut")
				.latitude(BigDecimal.valueOf(33.900 + (n % 50) * 0.001))
				.longitude(BigDecimal.valueOf(35.490 + (n % 50) * 0.001)).parentUserId(parentUserId).build()).getId();
	}

	protected UUID aParent() {
		return userRepository.save(User.builder().email("parent-" + UUID.randomUUID() + "@wassel.test")
				.passwordHash("x").role(Role.PARENT).schoolId(school).build()).getId();
	}

	/** The head of transportation adds these students to the route, in this order. */
	protected void onRoute(Bus bus, UUID... students) throws Exception {
		for (UUID student : students) {
			assertEquals(200, addToRoute(bus.routeId(), student).getStatus());
		}
	}

	protected MockHttpServletResponse addToRoute(String routeId, UUID student) throws Exception {
		return send(post(ROUTES + "/" + routeId + "/students").with(head()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"studentId\":\"%s\"}".formatted(student)));
	}

	protected MockHttpServletResponse removeFromRoute(String routeId, UUID student) throws Exception {
		return send(delete(ROUTES + "/" + routeId + "/students/" + student).with(head()));
	}

	protected MockHttpServletResponse reorder(String routeId, UUID... students) throws Exception {
		String ids = String.join(",", java.util.Arrays.stream(students).map(id -> "\"" + id + "\"").toList());
		return send(put(ROUTES + "/" + routeId + "/stops").with(head()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"studentIds\":[%s]}".formatted(ids)));
	}

	protected void aHoliday(LocalDate date) {
		holidayRepository.save(Holiday.builder().schoolId(school).date(date).name("Holiday").build());
	}

	protected void aHalfDay(LocalDate date) {
		halfDayRepository.save(HalfDay.builder().schoolId(school).date(date).build());
	}

	/** Moves "now" to this time of day in Beirut on the given date. */
	protected void setNow(LocalDate date, LocalTime time) {
		clock.set(date.atTime(time).atZone(ClockConfig.SCHOOL_ZONE).toInstant());
	}

	// ---------------------------------------------------------------- what the driver and the head do

	protected MockHttpServletResponse send(MockHttpServletRequestBuilder request) throws Exception {
		return mockMvc.perform(request).andReturn().getResponse();
	}

	protected String driverToday(Bus bus) throws Exception {
		MockHttpServletResponse response = send(get(DRIVER_TODAY).with(as(Role.DRIVER, bus.driverUserId())));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	protected String headRuns(String dateOrNull) throws Exception {
		MockHttpServletResponse response = send(dateOrNull == null ? get(HEAD_RUNS).with(head())
				: get(HEAD_RUNS).param("date", dateOrNull).with(head()));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	/** The id of today's run in this direction, from the driver's own list. */
	protected String runId(Bus bus, String direction) throws Exception {
		List<String> ids = JsonPath.read(driverToday(bus), "$.runs[?(@.direction == '" + direction + "')].id");
		assertEquals(1, ids.size(), direction + " runs: " + ids);
		return ids.get(0);
	}

	protected MockHttpServletResponse start(Bus bus, String runId) throws Exception {
		return send(post("/api/driver/runs/" + runId + "/start").with(as(Role.DRIVER, bus.driverUserId())));
	}

	protected MockHttpServletResponse end(Bus bus, String runId) throws Exception {
		return send(post("/api/driver/runs/" + runId + "/end").with(as(Role.DRIVER, bus.driverUserId())));
	}

	protected MockHttpServletResponse confirm(Bus bus, String runId, UUID student, String status) throws Exception {
		return send(put("/api/driver/runs/" + runId + "/students/" + student + "/confirmation")
				.with(as(Role.DRIVER, bus.driverUserId())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"status\":\"%s\"}".formatted(status)));
	}

	/** The parent reports a one-day absence for today through their own endpoint. */
	protected void absentToday(UUID parent, UUID child) throws Exception {
		MockHttpServletResponse response = send(post("/api/parent/children/" + child + "/absences")
				.with(as(Role.PARENT, parent)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"fromDate\":\"%s\"}".formatted(LocalDate.now(clock))));
		assertEquals(201, response.getStatus(), response.getContentAsString());
	}
}
