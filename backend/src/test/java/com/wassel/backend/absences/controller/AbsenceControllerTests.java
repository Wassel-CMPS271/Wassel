package com.wassel.backend.absences.controller;

import com.wassel.backend.absences.entity.Absence;
import com.wassel.backend.absences.repository.AbsenceRepository;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

	private final UUID schoolId = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private AbsenceRepository absenceRepository;

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
		LocalDate from = LocalDate.now().plusDays(1);
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
		LocalDate day = LocalDate.now().plusDays(1);

		mockMvc.perform(post(childUrl(child.id())).with(loggedInAsParent(parent.getId()))
						.contentType(MediaType.APPLICATION_JSON).content(absence(day.toString(), null)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.toDate").value(day.toString()));
	}

	@Test
	void reportingTheExactSameRangeAgainIsIdempotent() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now().plusDays(1);
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
				schoolId, child.id(), LocalDate.now()).size());
	}

	@Test
	void reportingAnOverlappingDifferentRangeIsRejected() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now().plusDays(5);
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
						.content(absence(LocalDate.now().minusDays(1).toString(), null)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.fromDate").isNotEmpty());
	}

	@Test
	void toDateBeforeFromDateIsRejected() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now().plusDays(5);

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
		LocalDate from = LocalDate.now().plusDays(3);
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
				.fromDate(LocalDate.now().minusDays(10)).toDate(LocalDate.now().minusDays(5))
				.createdBy(parent.getId()).build());

		mockMvc.perform(delete(childUrl(child.id()) + "/" + ended.getId()).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isConflict());
	}

	@Test
	void cancellingAnInProgressAbsenceShortensItInsteadOfDeletingIt() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent);
		LocalDate from = LocalDate.now().minusDays(2);
		LocalDate to = LocalDate.now().plusDays(5);
		Absence inProgress = absenceRepository.saveAndFlush(Absence.builder().schoolId(schoolId).studentId(child.id())
				.fromDate(from).toDate(to).createdBy(parent.getId()).build());

		mockMvc.perform(delete(childUrl(child.id()) + "/" + inProgress.getId()).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isNoContent());

		Absence reloaded = absenceRepository.findById(inProgress.getId()).orElseThrow();
		assertTrue(!reloaded.isCancelled(), "an in-progress absence is shortened, not marked cancelled");
		assertEquals(LocalDate.now().minusDays(1), reloaded.getToDate());

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
		LocalDate today = LocalDate.now();
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
		LocalDate today = LocalDate.now();
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
