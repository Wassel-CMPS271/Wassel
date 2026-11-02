package com.wassel.backend.absences.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.absences.dto.ReportAbsenceRequest;
import com.wassel.backend.absences.entity.Absence;
import com.wassel.backend.absences.repository.AbsenceRepository;
import com.wassel.backend.absences.service.AbsenceService;
import com.wassel.backend.drivers.dto.CreateDriverRequest;
import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.dto.RouteRequest;
import com.wassel.backend.routes.dto.RouteResponse;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.LinkParentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import com.wassel.backend.vehicles.dto.CreateVehicleRequest;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.service.VehicleService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-238, written from the ticket's acceptance criteria and {@code docs/contracts/runs.md},
 * not from {@link com.wassel.backend.absences.service.AbsenceService}'s own code. Every test uses
 * its own fresh school id, so tests never collide on the unique constraints of the fixtures they
 * create (vehicles, drivers, routes, students all live within one school).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AbsenceControllerTests {

	// Use the same school clock as AbsenceService; the CI JVM may be in UTC.
	@Autowired
	private Clock clock;

	private final UUID schoolId = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private AbsenceRepository absenceRepository;

	@Autowired
	private AbsenceService absenceService;

	@Autowired
	private StudentService studentService;

	@Autowired
	private VehicleService vehicleService;

	@Autowired
	private DriverService driverService;

	@Autowired
	private RouteService routeService;

	@Autowired
	private UserService userService;

	@Autowired
	private TransactionTemplate transactionTemplate;

	// --- fixtures -----------------------------------------------------------------------------

	private User newParent() {
		User parent = userService.createUser("parent-" + UUID.randomUUID() + "@wassel.test", "password123", Role.PARENT,
				schoolId);
		return parent;
	}

	private StudentResponse newChildOf(User parent) {
		StudentResponse student = studentService.addStudent(schoolId, new CreateStudentRequest("Tarek", "Mansour",
				"Grade 3", "Rana Mansour", "+961 3 123 456", null));
		studentService.linkParent(schoolId, student.id(), new LinkParentRequest(parent.getId()));
		return student;
	}

	private RouteResponse newRouteWithOneSeat() {
		VehicleResponse vehicle = vehicleService.addVehicle(schoolId,
				new CreateVehicleRequest("A " + (100000 + Math.abs(UUID.randomUUID().hashCode() % 899999)), 10));
		DriverResponse driver = driverService.addDriver(schoolId, new CreateDriverRequest("Karim", "Haddad",
				"+961 3 " + (100 + Math.abs(UUID.randomUUID().hashCode() % 800)) + " " + (100 + Math.abs(UUID.randomUUID().hashCode() % 800)),
				"driver-" + UUID.randomUUID() + "@wassel.test"));
		return routeService.createRoute(schoolId, new RouteRequest("Hamra morning run", vehicle.id(), driver.id()));
	}

	private RequestPostProcessor loggedInAsParent(UUID parentUserId) {
		User user = User.builder().id(parentUserId).email("principal@wassel.test").passwordHash("x")
				.role(Role.PARENT).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_PARENT"))));
	}

	private RequestPostProcessor loggedInAsHeadOfTransport() {
		User user = User.builder().id(UUID.randomUUID()).email("hot@wassel.test").passwordHash("x")
				.role(Role.HEAD_OF_TRANSPORT).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_HEAD_OF_TRANSPORT"))));
	}

	private String childUrl(UUID studentId) {
		return "/api/parent/children/" + studentId + "/absences";
	}

	private String absence(String fromDate, String toDate) {
		return toDate == null ? "{\"fromDate\":\"%s\"}".formatted(fromDate)
				: "{\"fromDate\":\"%s\",\"toDate\":\"%s\"}".formatted(fromDate, toDate);
	}

	// --- reporting ------------------------------------------------------------------------------

	@Test
	void listIsEmptyBeforeAnyAbsenceIsReported() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);

		mockMvc.perform(get(childUrl(child.id())).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void parentCanReportAnAbsenceAndSeeItInTheList() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now(clock).plusDays(1);
		LocalDate to = from.plusDays(2);

		mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId()))
						.contentType(MediaType.APPLICATION_JSON).content(absence(from.toString(), to.toString())))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.studentId").value(child.id().toString()))
				.andExpect(jsonPath("$.fromDate").value(from.toString()))
				.andExpect(jsonPath("$.toDate").value(to.toString()));

		mockMvc.perform(get(childUrl(child.id())).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void toDateDefaultsToFromDateForASingleDay() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate day = LocalDate.now(clock).plusDays(1);

		mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId()))
						.contentType(MediaType.APPLICATION_JSON).content(absence(day.toString(), null)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.toDate").value(day.toString()));
	}

	@Test
	void reportingTheExactSameRangeAgainIsIdempotent() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now(clock).plusDays(1);
		LocalDate to = from.plusDays(1);

		String firstId = mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId()))
						.contentType(MediaType.APPLICATION_JSON).content(absence(from.toString(), to.toString())))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();

		mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId()))
						.contentType(MediaType.APPLICATION_JSON).content(absence(from.toString(), to.toString())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(idOf(firstId)));

		assertEquals(1, absenceRepository.findBySchoolIdAndStudentIdAndCancelledFalseAndToDateGreaterThanEqualOrderByFromDateAsc(
				schoolId, child.id(), LocalDate.now(clock)).size());
	}

	/**
	 * Two requests for the exact same range at once (BUG-1 of SCRUM-236, SCRUM-258). Calls the service directly, the
	 * same way {@code PasswordControllerTests.twoRequestsWithTheSameTokenSucceedExactlyOnce} drives its own race, so
	 * both attempts are genuinely concurrent rather than serialized by one MockMvc request at a time. The child's lock
	 * makes the second one wait for the first, so it sees the committed row and gets the contract's 200 for an exact
	 * repeat: never an exception, and never a second row.
	 */
	@Test
	void reportingTheSameRangeTwiceAtOnceCreatesOneAndAnswersTheOtherWithIt() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now(clock).plusDays(10);
		LocalDate to = from.plusDays(1);
		ReportAbsenceRequest request = new ReportAbsenceRequest(from, to);
		CountDownLatch start = new CountDownLatch(1);

		Callable<AbsenceService.ReportResult> attempt = () -> {
			start.await();
			return absenceService.reportAbsence(schoolId, parent.getId(), child.id(), request);
		};

		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			Future<AbsenceService.ReportResult> first = pool.submit(attempt);
			Future<AbsenceService.ReportResult> second = pool.submit(attempt);
			start.countDown();
			List<AbsenceService.ReportResult> results = List.of(first.get(), second.get());
			assertEquals(1, results.stream().filter(AbsenceService.ReportResult::created).count(), results.toString());
			assertEquals(results.get(0).absence().id(), results.get(1).absence().id());
		} finally {
			pool.shutdown();
		}

		assertEquals(1, absenceRepository.findOverlapping(schoolId, child.id(), from, to).size());
	}

	/**
	 * Holds the child's lock in another transaction and saves {@code meanwhile} in it, then sends the report. The
	 * report must still be waiting a second later, and is answered once the lock is let go, which is returned.
	 */
	private MockHttpServletResponse reportedWhileChildLocked(User parent, StudentResponse child, Absence meanwhile,
			String body) throws Exception {
		CountDownLatch locked = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			pool.submit(() -> transactionTemplate.execute(tx -> {
				absenceRepository.lockStudent(child.id());
				absenceRepository.saveAndFlush(meanwhile);
				locked.countDown();
				try {
					release.await();
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
				return null;
			}));
			assertTrue(locked.await(10, TimeUnit.SECONDS));
			Future<MockHttpServletResponse> sent = pool.submit(() -> mockMvc.perform(post(childUrl(child.id()))
							.with(loggedInAsParent(parent.getId())).contentType(MediaType.APPLICATION_JSON).content(body))
					.andReturn().getResponse());

			assertThrows(TimeoutException.class, () -> sent.get(1, TimeUnit.SECONDS));
			release.countDown();
			return sent.get(10, TimeUnit.SECONDS);
		} finally {
			release.countDown();
			pool.shutdownNow();
		}
	}

	private Absence anAbsence(User parent, StudentResponse child, LocalDate from, LocalDate to) {
		return Absence.builder().schoolId(schoolId).studentId(child.id()).fromDate(from).toDate(to)
				.createdBy(parent.getId()).build();
	}

	/** What makes the race safe: the overlap check runs only once the report holds the child's lock. */
	@Test
	void aReportWaitsForTheChildsLockAndThenAnswersAnExactRepeatWith200() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate day = LocalDate.now(clock).plusDays(12);
		Absence meanwhile = anAbsence(parent, child, day, day);

		MockHttpServletResponse answer = reportedWhileChildLocked(parent, child, meanwhile, absence(day.toString(), null));

		assertEquals(200, answer.getStatus(), answer.getContentAsString());
		assertEquals(meanwhile.getId().toString(), JsonPath.read(answer.getContentAsString(), "$.id"));
	}

	@Test
	void aReportWaitsForTheChildsLockAndThenRejectsAnOverlapNamingIt() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now(clock).plusDays(14);
		Absence meanwhile = anAbsence(parent, child, from, from.plusDays(1));

		MockHttpServletResponse answer = reportedWhileChildLocked(parent, child, meanwhile,
				absence(from.plusDays(1).toString(), from.plusDays(2).toString()));

		assertEquals(409, answer.getStatus(), answer.getContentAsString());
		assertEquals("Overlaps an absence already reported from %s to %s.".formatted(from, from.plusDays(1)),
				JsonPath.read(answer.getContentAsString(), "$.errors.fromDate"));
	}

	@Test
	void reportingAnOverlappingDifferentRangeIsRejected() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now(clock).plusDays(5);
		LocalDate to = from.plusDays(3);
		mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId()))
						.contentType(MediaType.APPLICATION_JSON).content(absence(from.toString(), to.toString())))
				.andExpect(status().isCreated());

		// Overlaps by one day (the new range starts inside the existing one), not an exact repeat.
		mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId())).contentType(MediaType.APPLICATION_JSON)
						.content(absence(to.toString(), to.plusDays(2).toString())))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.fromDate").isNotEmpty());
	}

	@Test
	void fromDateInThePastIsRejected() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);

		mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId())).contentType(MediaType.APPLICATION_JSON)
						.content(absence(LocalDate.now(clock).minusDays(1).toString(), null)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.fromDate").isNotEmpty());
	}

	@Test
	void toDateBeforeFromDateIsRejected() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now(clock).plusDays(5);

		mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId())).contentType(MediaType.APPLICATION_JSON)
						.content(absence(from.toString(), from.minusDays(1).toString())))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.toDate").isNotEmpty());
	}

	@Test
	void aParentCannotReportForAChildThatIsNotTheirs() throws Exception {
		User parent = newParent();
		User someoneElse = newParent();
		StudentResponse child = newChildOf(someoneElse);

		mockMvc.perform(get(childUrl(child.id())).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isNotFound());
	}

	@Test
	void aParentCannotReportForAnUnknownStudent() throws Exception {
		User parent = newParent();

		mockMvc.perform(get(childUrl(UUID.randomUUID())).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isNotFound());
	}

	// --- cancelling -----------------------------------------------------------------------------

	@Test
	void cancellingAFutureAbsenceRemovesItFromTheList() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now(clock).plusDays(3);
		String body = mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId()))
						.contentType(MediaType.APPLICATION_JSON).content(absence(from.toString(), null)))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		UUID absenceId = UUID.fromString(idOf(body));

		mockMvc.perform(delete(childUrl(child.id()) + "/" + absenceId).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isNoContent());

		mockMvc.perform(get(childUrl(child.id())).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void cancellingAnAlreadyEndedAbsenceIsRejected() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		// The reporting endpoint itself refuses a past fromDate, so an already-ended absence is
		// seeded directly, the same way a test seeds a state the API can't produce on its own.
		Absence ended = absenceRepository.saveAndFlush(Absence.builder().schoolId(schoolId).studentId(child.id())
				.fromDate(LocalDate.now(clock).minusDays(10)).toDate(LocalDate.now(clock).minusDays(5))
				.createdBy(parent.getId()).build());

		mockMvc.perform(delete(childUrl(child.id()) + "/" + ended.getId()).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isConflict());
	}

	@Test
	void cancellingAnInProgressAbsenceShortensItInsteadOfDeletingIt() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now(clock).minusDays(2);
		LocalDate to = LocalDate.now(clock).plusDays(5);
		Absence inProgress = absenceRepository.saveAndFlush(Absence.builder().schoolId(schoolId).studentId(child.id())
				.fromDate(from).toDate(to).createdBy(parent.getId()).build());

		mockMvc.perform(delete(childUrl(child.id()) + "/" + inProgress.getId()).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isNoContent());

		Absence reloaded = absenceRepository.findById(inProgress.getId()).orElseThrow();
		assertTrue(!reloaded.isCancelled(), "an in-progress absence is shortened, not marked cancelled");
		assertEquals(LocalDate.now(clock).minusDays(1), reloaded.getToDate());

		// Shortened to end yesterday, so it's gone from the upcoming list (toDate < today).
		mockMvc.perform(get(childUrl(child.id())).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	// --- head of transportation -------------------------------------------------------------------

	@Test
	void headOfTransportSeesAStudentWithNoRouteAsNullRouteAndPosition() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate today = LocalDate.now(clock);
		absenceRepository.saveAndFlush(Absence.builder().schoolId(schoolId).studentId(child.id())
				.fromDate(today).toDate(today).createdBy(parent.getId()).build());

		mockMvc.perform(get("/api/head-of-transport/absences").with(loggedInAsHeadOfTransport())
						.param("date", today.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].studentId").value(child.id().toString()))
				.andExpect(jsonPath("$[0].firstName").value("Tarek"))
				.andExpect(jsonPath("$[0].route").isEmpty())
				.andExpect(jsonPath("$[0].position").isEmpty());
	}

	@Test
	void headOfTransportSeesTheRouteAndPositionOfAStudentOnOne() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		RouteResponse route = newRouteWithOneSeat();
		routeService.addStudent(schoolId, route.id(), new com.wassel.backend.routes.dto.AssignStudentRequest(child.id()));
		LocalDate today = LocalDate.now(clock);
		absenceRepository.saveAndFlush(Absence.builder().schoolId(schoolId).studentId(child.id())
				.fromDate(today).toDate(today).createdBy(parent.getId()).build());

		mockMvc.perform(get("/api/head-of-transport/absences").with(loggedInAsHeadOfTransport())
						.param("date", today.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].route.id").value(route.id().toString()))
				.andExpect(jsonPath("$[0].route.name").value("Hamra morning run"))
				.andExpect(jsonPath("$[0].position").value(1));
	}

	@Test
	void headOfTransportDateDefaultsToToday() throws Exception {
		mockMvc.perform(get("/api/head-of-transport/absences").with(loggedInAsHeadOfTransport()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	private static String idOf(String json) {
		java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
		matcher.find();
		return matcher.group(1);
	}
}
