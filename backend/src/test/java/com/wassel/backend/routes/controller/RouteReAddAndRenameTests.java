package com.wassel.backend.routes.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.repository.RouteProposalRepository;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.routes.repository.RouteVersionRepository;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.vehicles.entity.Vehicle;
import com.wassel.backend.vehicles.repository.VehicleRepository;
import org.junit.jupiter.api.BeforeEach;
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

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-205 findings A and B. Re-adding a student already on a route changes nothing, and
 * editing a route does not re-check a vehicle or driver it already has.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RouteReAddAndRenameTests {

	private static final String URL = "/api/head-of-transport/routes";

	private final UUID school = UUID.randomUUID();

	private final AtomicInteger counter = new AtomicInteger();

	@Autowired
	private MockMvc mockMvc;

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

	@BeforeEach
	void cleanDatabase() {
		proposalRepository.deleteAll();
		versionRepository.deleteAll();
		routeRepository.deleteAll();
		driverRepository.deleteAll();
		vehicleRepository.deleteAll();
		studentRepository.deleteAll();
	}

	private RequestPostProcessor head() {
		User user = User.builder().id(UUID.randomUUID()).email("head@wassel.test").passwordHash("x")
				.role(Role.HEAD_OF_TRANSPORT).schoolId(school).build();
		return authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_HEAD_OF_TRANSPORT"))));
	}

	private UUID aVehicle() {
		return vehicleRepository.save(Vehicle.builder().schoolId(school)
				.plateNumber("R " + (100000 + counter.incrementAndGet())).capacity(14).active(true).build()).getId();
	}

	private UUID aDriver(DriverStatus status) {
		return driverRepository.save(Driver.builder().schoolId(school).firstName("Walid").lastName("Barakat")
				.phone("0" + (10000000 + counter.incrementAndGet())).email(UUID.randomUUID() + "@wassel.test")
				.status(status).invitedAt(Instant.now()).build()).getId();
	}

	private UUID aStudent() {
		return studentRepository.save(Student.builder().schoolId(school).firstName("Hadi").lastName("Rizk")
				.grade("5").guardianName("Guardian Name").guardianPhone("0" + (10000000 + counter.incrementAndGet()))
				.status(StudentStatus.ACTIVE).build()).getId();
	}

	private static String body(String name, UUID vehicleId, UUID driverId) {
		return "{\"name\":\"%s\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}".formatted(name, vehicleId, driverId);
	}

	private String createRoute(String name, UUID vehicleId, UUID driverId) throws Exception {
		String response = mockMvc.perform(post(URL).with(head()).contentType(MediaType.APPLICATION_JSON)
						.content(body(name, vehicleId, driverId)))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(response, "$.id");
	}

	private org.springframework.test.web.servlet.ResultActions assign(String routeId, UUID studentId)
			throws Exception {
		return mockMvc.perform(post(URL + "/" + routeId + "/students").with(head())
				.contentType(MediaType.APPLICATION_JSON).content("{\"studentId\":\"%s\"}".formatted(studentId)));
	}

	@Test
	void reAddingAStudentAlreadyOnTheRouteChangesNothing() throws Exception {
		String id = createRoute("Verdun morning run", aVehicle(), aDriver(DriverStatus.ACTIVE));
		UUID first = aStudent();
		UUID middle = aStudent();
		UUID last = aStudent();
		assign(id, first).andExpect(status().isOk());
		assign(id, middle).andExpect(status().isOk());
		assign(id, last).andExpect(status().isOk());

		assign(id, middle).andExpect(status().isOk())
				.andExpect(jsonPath("$.stops[0].studentId").value(first.toString()))
				.andExpect(jsonPath("$.stops[1].studentId").value(middle.toString()))
				.andExpect(jsonPath("$.stops[2].studentId").value(last.toString()));
	}

	@Test
	void renamingARouteWhoseVehicleWasDeactivatedLaterStillWorks() throws Exception {
		UUID vehicleId = aVehicle();
		UUID driverId = aDriver(DriverStatus.ACTIVE);
		String id = createRoute("Verdun morning run", vehicleId, driverId);
		Vehicle vehicle = vehicleRepository.findById(vehicleId).orElseThrow();
		vehicle.setActive(false);
		vehicleRepository.save(vehicle);

		mockMvc.perform(put(URL + "/" + id).with(head()).contentType(MediaType.APPLICATION_JSON)
						.content(body("Renamed", vehicleId, driverId)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Renamed"));
	}

	@Test
	void renamingARouteWhoseDriverWasDeactivatedLaterStillWorks() throws Exception {
		UUID vehicleId = aVehicle();
		UUID driverId = aDriver(DriverStatus.ACTIVE);
		String id = createRoute("Verdun morning run", vehicleId, driverId);
		Driver driver = driverRepository.findById(driverId).orElseThrow();
		driver.setStatus(DriverStatus.DEACTIVATED);
		driverRepository.save(driver);

		mockMvc.perform(put(URL + "/" + id).with(head()).contentType(MediaType.APPLICATION_JSON)
						.content(body("Renamed", vehicleId, driverId)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Renamed"));
	}
}
