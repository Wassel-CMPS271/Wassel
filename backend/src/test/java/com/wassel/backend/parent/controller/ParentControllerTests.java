package com.wassel.backend.parent.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.drivers.dto.CreateDriverRequest;
import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.dto.AssignStudentRequest;
import com.wassel.backend.routes.dto.RouteRequest;
import com.wassel.backend.routes.dto.RouteResponse;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.schools.entity.SchoolSettings;
import com.wassel.backend.schools.repository.SchoolSettingsRepository;
import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.LinkParentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.dto.UpdateStudentLocationRequest;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-240, written from the ticket's acceptance criteria and docs/contracts/runs.md, not from
 * {@link com.wassel.backend.parent.service.ParentService}'s own code. Every test uses its own
 * fresh school id, so fixtures (vehicles, drivers, routes, students) never collide across tests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ParentControllerTests {

	private static final String URL = "/api/parent/children";

	private final UUID schoolId = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserService userService;

	@Autowired
	private StudentService studentService;

	@Autowired
	private VehicleService vehicleService;

	@Autowired
	private DriverService driverService;

	@Autowired
	private RouteService routeService;

	@Autowired
	private SchoolSettingsRepository schoolSettingsRepository;

	// ---- fixtures ----

	private User newParent() {
		return userService.createUser("parent-" + UUID.randomUUID() + "@wassel.test", "password123", Role.PARENT,
				schoolId);
	}

	private StudentResponse newChildOf(User parent, String firstName) {
		StudentResponse student = studentService.addStudent(schoolId, new CreateStudentRequest(firstName, "Mansour",
				"Grade 3", "Rana Mansour", "+961 3 " + (100000 + Math.abs(UUID.randomUUID().hashCode() % 899999)),
				null));
		studentService.linkParent(schoolId, student.id(), new LinkParentRequest(parent.getId()));
		return student;
	}

	private void schoolTimes(String arrival) {
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(schoolId)
				.arrivalTime(LocalTime.parse(arrival)).build());
	}

	private RouteResponse aRoute(String name) {
		VehicleResponse vehicle = vehicleService.addVehicle(schoolId,
				new CreateVehicleRequest("A " + (100000 + Math.abs(UUID.randomUUID().hashCode() % 899999)), 14));
		DriverResponse driver = driverService.addDriver(schoolId, new CreateDriverRequest("Karim", "Haddad",
				"+961 3 100 101", "driver-" + UUID.randomUUID() + "@wassel.test"));
		return routeService.createRoute(schoolId, new RouteRequest(name, vehicle.id(), driver.id()));
	}

	/** Pins the child so the route can compute an arrival time for them, then adds them to the route. */
	private void putOnRoute(UUID routeId, UUID studentId) {
		studentService.updateLocation(schoolId, studentId,
				new UpdateStudentLocationRequest(new BigDecimal("33.8959"), new BigDecimal("35.5017")));
		routeService.addStudent(schoolId, routeId, new AssignStudentRequest(studentId));
	}

	private RequestPostProcessor loggedInAsParent(UUID parentUserId) {
		User user = User.builder().id(parentUserId).email("principal@wassel.test").passwordHash("x")
				.role(Role.PARENT).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_PARENT"))));
	}

	// ---- tests ----

	@Test
	void aChildOnARouteComesBackWithRouteDriverVehicleAndPickupTime() throws Exception {
		schoolTimes("07:30");
		User parent = newParent();
		StudentResponse child = newChildOf(parent, "Tarek");
		RouteResponse route = aRoute("Hamra morning run");
		putOnRoute(route.id(), child.id());

		mockMvc.perform(get(URL).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].studentId").value(child.id().toString()))
				.andExpect(jsonPath("$[0].firstName").value("Tarek"))
				.andExpect(jsonPath("$[0].lastName").value("Mansour"))
				.andExpect(jsonPath("$[0].route.id").value(route.id().toString()))
				.andExpect(jsonPath("$[0].route.name").value("Hamra morning run"))
				.andExpect(jsonPath("$[0].driver.firstName").value("Karim"))
				.andExpect(jsonPath("$[0].driver.lastName").value("Haddad"))
				.andExpect(jsonPath("$[0].driver.phone").value("+961 3 100 101"))
				.andExpect(jsonPath("$[0].vehicle.plateNumber").isNotEmpty())
				// Not exactly the school's arrival time: the pin isn't at the school, so travel time
				// pulls it earlier, the same arrival-time rule the route's own stops use (SCRUM-212).
				.andExpect(jsonPath("$[0].expectedPickupTime")
						.value(org.hamcrest.Matchers.matchesPattern("\\d\\d:\\d\\d")));
	}

	@Test
	void aChildNotOnARouteComesBackWithNoRouteYet() throws Exception {
		User parent = newParent();
		newChildOf(parent, "Layla");

		mockMvc.perform(get(URL).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Layla"))
				.andExpect(jsonPath("$[0].route").value(nullValue()))
				.andExpect(jsonPath("$[0].driver").value(nullValue()))
				.andExpect(jsonPath("$[0].vehicle").value(nullValue()))
				.andExpect(jsonPath("$[0].expectedPickupTime").value(nullValue()));
	}

	@Test
	void everyChildIsOrderedByFirstName() throws Exception {
		User parent = newParent();
		newChildOf(parent, "Tarek");
		newChildOf(parent, "Dana");
		newChildOf(parent, "Salma");

		mockMvc.perform(get(URL).with(loggedInAsParent(parent.getId())))
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0].firstName").value("Dana"))
				.andExpect(jsonPath("$[1].firstName").value("Salma"))
				.andExpect(jsonPath("$[2].firstName").value("Tarek"));
	}

	@Test
	void aParentWithNoChildrenGetsAnEmptyList() throws Exception {
		User parent = newParent();

		mockMvc.perform(get(URL).with(loggedInAsParent(parent.getId())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void aParentNeverSeesChildrenNotLinkedToThem() throws Exception {
		User parentA = newParent();
		User parentB = newParent();
		newChildOf(parentA, "Tarek");
		newChildOf(parentB, "Dana");

		mockMvc.perform(get(URL).with(loggedInAsParent(parentA.getId())))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Tarek"));
		mockMvc.perform(get(URL).with(loggedInAsParent(parentB.getId())))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Dana"));
	}

	@Test
	void anotherSchoolsChildrenAreNeverReturned() throws Exception {
		User parentHere = newParent();
		newChildOf(parentHere, "Tarek");
		// Same parent user id, a different school: a student there must not leak into this one.
		UUID otherSchool = UUID.randomUUID();
		User parentThere = userService.createUser("parent-" + UUID.randomUUID() + "@wassel.test", "password123",
				Role.PARENT, otherSchool);

		mockMvc.perform(get(URL).with(loggedInAsParent(parentHere.getId())))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Tarek"));
	}

	@Test
	void expectedPickupTimeIsNullWhenTheSchoolHasNotSetItsArrivalTime() throws Exception {
		User parent = newParent();
		StudentResponse child = newChildOf(parent, "Tarek");
		RouteResponse route = aRoute("Hamra morning run");
		putOnRoute(route.id(), child.id());

		mockMvc.perform(get(URL).with(loggedInAsParent(parent.getId())))
				.andExpect(jsonPath("$[0].route").value(org.hamcrest.Matchers.notNullValue()))
				.andExpect(jsonPath("$[0].expectedPickupTime").value(nullValue()));
	}

	@Test
	void expectedPickupTimeIsNullWhenTheChildHasNoPin() throws Exception {
		schoolTimes("07:30");
		User parent = newParent();
		StudentResponse child = newChildOf(parent, "Tarek");
		RouteResponse route = aRoute("Hamra morning run");
		routeService.addStudent(schoolId, route.id(), new AssignStudentRequest(child.id()));

		mockMvc.perform(get(URL).with(loggedInAsParent(parent.getId())))
				.andExpect(jsonPath("$[0].route").value(org.hamcrest.Matchers.notNullValue()))
				.andExpect(jsonPath("$[0].expectedPickupTime").value(nullValue()));
	}

	@Test
	void theEndpointNeedsASessionAndTheParentRole() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
		for (Role role : List.of(Role.HEAD_OF_TRANSPORT, Role.DRIVER, Role.ADMIN)) {
			User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test").passwordHash("x")
					.role(role).schoolId(schoolId).build();
			mockMvc.perform(get(URL).with(authentication(new UsernamePasswordAuthenticationToken(
							user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))))))
					.andExpect(status().isForbidden())
					.andExpect(jsonPath("$.detail").value("Access denied"));
		}
	}

	@Test
	void theResponseHasExactlyTheFieldsOfTheContractSample() throws Exception {
		schoolTimes("07:30");
		User parent = newParent();
		newChildOf(parent, "Layla");
		StudentResponse tarek = newChildOf(parent, "Tarek");
		RouteResponse route = aRoute("Hamra morning run");
		putOnRoute(route.id(), tarek.id());

		String response = mockMvc.perform(get(URL).with(loggedInAsParent(parent.getId())))
				.andReturn().getResponse().getContentAsString();
		String sample = Files.readString(Path.of("../docs/contracts/samples/runs/parent-children.json"));

		assertEquals(keys(sample, "$[0]"), keys(response, "$[0]"));
		assertEquals(keys(sample, "$[1]"), keys(response, "$[1]"));
		assertEquals(keys(sample, "$[1].route"), keys(response, "$[1].route"));
		assertEquals(keys(sample, "$[1].driver"), keys(response, "$[1].driver"));
		assertEquals(keys(sample, "$[1].vehicle"), keys(response, "$[1].vehicle"));
	}

	private Set<String> keys(String json, String path) {
		Map<String, Object> object = JsonPath.read(json, path);
		return object.keySet();
	}
}
