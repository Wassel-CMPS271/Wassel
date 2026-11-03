package com.wassel.backend.vehicles.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.WhileLocked;
import com.wassel.backend.drivers.dto.CreateDriverRequest;
import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.dto.AssignStudentRequest;
import com.wassel.backend.routes.dto.RouteRequest;
import com.wassel.backend.routes.dto.RouteResponse;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.vehicles.repository.VehicleRepository;
import org.junit.jupiter.api.BeforeEach;
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

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class VehicleControllerTests {

	private static final String URL = "/api/head-of-transport/vehicles";

	private final UUID schoolA = UUID.randomUUID();
	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private VehicleRepository vehicleRepository;

	@Autowired
	private RouteRepository routeRepository;

	@Autowired
	private DriverRepository driverRepository;

	@Autowired
	private StudentRepository studentRepository;

	@Autowired
	private RouteService routeService;

	@Autowired
	private DriverService driverService;

	@Autowired
	private StudentService studentService;

	@Autowired
	private TransactionTemplate transactionTemplate;

	@BeforeEach
	void cleanDatabase() {
		routeRepository.deleteAll();
		vehicleRepository.deleteAll();
		driverRepository.deleteAll();
		studentRepository.deleteAll();
	}

	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private String vehicle(String plateNumber, int capacity) {
		return "{\"plateNumber\":\"%s\",\"capacity\":%d}".formatted(plateNumber, capacity);
	}

	private String addAs(UUID schoolId, String plateNumber, int capacity) throws Exception {
		String body = mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
						.contentType(MediaType.APPLICATION_JSON).content(vehicle(plateNumber, capacity)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		Matcher matcher = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(body);
		matcher.find();
		return matcher.group(1);
	}

	/** A route on this vehicle with {@code studentCount} students already assigned (SCRUM-241 fixtures); its id. */
	private UUID aRouteWithStudents(UUID schoolId, UUID vehicleId, int studentCount) {
		DriverResponse driver = driverService.addDriver(schoolId, new CreateDriverRequest("Karim", "Haddad",
				"+961 3 " + (100000 + (int) (Math.random() * 900000)), UUID.randomUUID() + "@wassel.test"));
		RouteResponse route = routeService.createRoute(schoolId,
				new RouteRequest("Hamra morning run", vehicleId, driver.id()));
		for (int i = 0; i < studentCount; i++) {
			StudentResponse student = studentService.addStudent(schoolId, new CreateStudentRequest("Student",
					"Number" + i, "3", "Guardian", "+961 3 " + (200000 + i), null));
			routeService.addStudent(schoolId, route.id(), new AssignStudentRequest(student.id()));
		}
		return route.id();
	}

	private MockHttpServletResponse setCapacityAs(UUID schoolId, String vehicleId, int capacity) throws Exception {
		return mockMvc.perform(patch(URL + "/" + vehicleId + "/capacity").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
						.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":%d}".formatted(capacity)))
				.andReturn().getResponse();
	}

	@Test
	void listIsEmptyBeforeAnyVehicleIsAdded() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void headOfTransportCanAddAVehicleAndSeeItInTheList() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(vehicle("A 123456", 14)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.plateNumber").value("A 123456"))
				.andExpect(jsonPath("$.capacity").value(14))
				.andExpect(jsonPath("$.isActive").value(true))
				.andExpect(jsonPath("$.createdAt").isNotEmpty());

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].plateNumber").value("A 123456"));
	}

	@Test
	void thePlateNumberIsTrimmed() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(vehicle("  A 123456  ", 14)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.plateNumber").value("A 123456"));
	}

	@Test
	void aSecondVehicleWithTheSamePlateIsRejectedAndTheFirstIsKept() throws Exception {
		addAs(schoolA, "A 123456", 14);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(vehicle("A 123456", 20)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.plateNumber").value("A vehicle with that plate number already exists."));

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].capacity").value(14));
	}

	@Test
	void differentSchoolsCanHaveAVehicleWithTheSamePlate() throws Exception {
		addAs(schoolA, "A 123456", 14);
		addAs(schoolB, "A 123456", 20);
	}

	@Test
	void eachSchoolOnlySeesItsOwnVehicles() throws Exception {
		addAs(schoolA, "A 123456", 14);
		addAs(schoolB, "B 234567", 20);

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].plateNumber").value("A 123456"));
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].plateNumber").value("B 234567"));
	}

	@Test
	void plateNumberAndCapacityAreRequiredAndValidated() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":14}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.plateNumber").value("Plate number is required"));

		for (String bad : new String[] { "A123456", "AB 12345678", "1 123456", "A 123456X" }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(vehicle(bad, 14)))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.plateNumber")
							.value("Use a format like \"A 123456\" (1-3 letters, space, 1-6 digits)"));
		}

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"plateNumber\":\"A 123456\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.capacity").value("Capacity is required"));

		for (int bad : new int[] { 0, -1 }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(vehicle("A 123456", bad)))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.capacity").value("Capacity must be a positive number"));
		}

		assertEquals(0, vehicleRepository.count());
	}

	@Test
	void headOfTransportCanSetCapacity() throws Exception {
		String id = addAs(schoolA, "A 123456", 14);

		mockMvc.perform(patch(URL + "/" + id + "/capacity").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":20}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.capacity").value(20));
	}

	@Test
	void loweringCapacityBelowTheRoutesStudentsIsAConflict() throws Exception {
		String id = addAs(schoolA, "A 123456", 5);
		aRouteWithStudents(schoolA, UUID.fromString(id), 2);

		mockMvc.perform(patch(URL + "/" + id + "/capacity").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":1}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("The route has 2 students but this vehicle would seat 1."));

		assertEquals(5, (int) vehicleRepository.findById(UUID.fromString(id)).orElseThrow().getCapacity());
	}

	/**
	 * A student added while the seat change waits for the route's lock must be counted (SCRUM-259). Counted before
	 * the lock, the change passes on the old count and leaves the route overfull: SCRUM-236's BUG-2.
	 */
	@Test
	void loweringCapacityWaitsForTheRouteLockAndCountsAStudentAddedMeanwhile() throws Exception {
		String id = addAs(schoolA, "A 123456", 3);
		UUID routeId = aRouteWithStudents(schoolA, UUID.fromString(id), 1);
		StudentResponse next = studentService.addStudent(schoolA,
				new CreateStudentRequest("Student", "Next", "3", "Guardian", "+961 3 299999", null));

		MockHttpServletResponse answer = WhileLocked.send(transactionTemplate, () -> {
			routeRepository.findLockedBySchoolIdAndId(schoolA, routeId);
			routeService.addStudent(schoolA, routeId, new AssignStudentRequest(next.id()));
		}, () -> setCapacityAs(schoolA, id, 1));

		assertEquals(409, answer.getStatus(), answer.getContentAsString());
		assertEquals("The route has 2 students but this vehicle would seat 1.",
				JsonPath.read(answer.getContentAsString(), "$.detail"));
		assertEquals(3, (int) vehicleRepository.findById(UUID.fromString(id)).orElseThrow().getCapacity());
	}

	/**
	 * The vehicle put on a route while the seat change waits for the vehicle's lock: the change must count that
	 * route's students, not the "no route" it would have seen before the lock (SCRUM-259).
	 */
	@Test
	void loweringCapacityWaitsForTheVehicleLockAndCountsTheRouteItWasPutOnMeanwhile() throws Exception {
		String first = addAs(schoolA, "A 123456", 5);
		UUID routeId = aRouteWithStudents(schoolA, UUID.fromString(first), 2);
		UUID second = UUID.fromString(addAs(schoolA, "B 234567", 5));
		UUID driverId = routeRepository.findById(routeId).orElseThrow().getDriverId();

		MockHttpServletResponse answer = WhileLocked.send(transactionTemplate, () -> {
			vehicleRepository.findLockedBySchoolIdAndId(schoolA, second);
			routeService.editRoute(schoolA, routeId, new RouteRequest("Hamra morning run", second, driverId));
		}, () -> setCapacityAs(schoolA, second.toString(), 1));

		assertEquals(409, answer.getStatus(), answer.getContentAsString());
		assertEquals("The route has 2 students but this vehicle would seat 1.",
				JsonPath.read(answer.getContentAsString(), "$.detail"));
		assertEquals(5, (int) vehicleRepository.findById(second).orElseThrow().getCapacity());
	}

	@Test
	void loweringCapacityToExactlyTheStudentCountIsAllowed() throws Exception {
		String id = addAs(schoolA, "A 123456", 5);
		aRouteWithStudents(schoolA, UUID.fromString(id), 2);

		mockMvc.perform(patch(URL + "/" + id + "/capacity").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":2}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.capacity").value(2));
	}

	@Test
	void aVehicleNotOnARouteCanBeLoweredToAnyValidCapacity() throws Exception {
		String id = addAs(schoolA, "A 123456", 14);

		mockMvc.perform(patch(URL + "/" + id + "/capacity").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":1}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.capacity").value(1));
	}

	@Test
	void settingCapacityOnAnUnknownOrOtherSchoolVehicleIsNotFound() throws Exception {
		String id = addAs(schoolA, "A 123456", 14);

		mockMvc.perform(patch(URL + "/" + UUID.randomUUID() + "/capacity")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":20}"))
				.andExpect(status().isNotFound());

		mockMvc.perform(patch(URL + "/" + id + "/capacity").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB))
						.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":20}"))
				.andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanDeactivateAndReactivateAVehicle() throws Exception {
		String id = addAs(schoolA, "A 123456", 14);

		mockMvc.perform(patch(URL + "/" + id + "/deactivate").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.isActive").value(false));

		mockMvc.perform(patch(URL + "/" + id + "/reactivate").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.isActive").value(true));
	}

	@Test
	void nonHeadOfTransportRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.ADMIN, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(get(URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
			mockMvc.perform(post(URL).with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(vehicle("A 123456", 14)))
					.andExpect(status().isForbidden());
		}
		assertEquals(0, vehicleRepository.count());
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
		mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(vehicle("A 123456", 14)))
				.andExpect(status().isUnauthorized());
	}
}
