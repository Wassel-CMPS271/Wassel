package com.wassel.backend.routes.controller;

import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.repository.RouteRepository;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RouteControllerTests {

	private static final String URL = "/api/head-of-transport/routes";

	private final UUID schoolA = UUID.randomUUID();

	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private RouteRepository routeRepository;

	@Autowired
	private VehicleRepository vehicleRepository;

	@Autowired
	private DriverRepository driverRepository;

	@BeforeEach
	void cleanDatabase() {
		routeRepository.deleteAll();
		driverRepository.deleteAll();
		vehicleRepository.deleteAll();
	}

	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private UUID aVehicle(UUID schoolId, boolean active) {
		Vehicle vehicle = vehicleRepository.save(Vehicle.builder().schoolId(schoolId)
				.plateNumber("A " + (100000 + (int) (Math.random() * 900000))).capacity(14).active(active).build());
		return vehicle.getId();
	}

	private UUID aDriver(UUID schoolId) {
		return aDriver(schoolId, DriverStatus.ACTIVE);
	}

	// There's no deactivate endpoint on the drivers module yet, so a deactivated driver can only
	// be produced directly through the repository, same as in production data today.
	private UUID aDriver(UUID schoolId, DriverStatus status) {
		Driver driver = driverRepository.save(Driver.builder().schoolId(schoolId)
				.firstName("Walid").lastName("Barakat").phone("0" + (int) (Math.random() * 100000000))
				.email(UUID.randomUUID() + "@wassel.test").status(status).invitedAt(Instant.now())
				.build());
		return driver.getId();
	}

	private String route(String name, UUID vehicleId, UUID driverId) {
		return "{\"name\":\"%s\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}".formatted(name, vehicleId, driverId);
	}

	private String createAs(UUID schoolId, String name, UUID vehicleId, UUID driverId) throws Exception {
		String body = mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
						.contentType(MediaType.APPLICATION_JSON).content(route(name, vehicleId, driverId)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		Matcher matcher = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(body);
		matcher.find();
		return matcher.group(1);
	}

	@Test
	void listIsEmptyBeforeAnyRouteIsAdded() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void headOfTransportCanCreateARouteAndSeeItInTheList() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		UUID driverId = aDriver(schoolA);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(route("Verdun morning run", vehicleId, driverId)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.name").value("Verdun morning run"))
				.andExpect(jsonPath("$.vehicle.id").value(vehicleId.toString()))
				.andExpect(jsonPath("$.vehicle.capacity").value(14))
				.andExpect(jsonPath("$.driver.id").value(driverId.toString()))
				.andExpect(jsonPath("$.studentCount").value(0))
				.andExpect(jsonPath("$.seatsLeft").value(14))
				.andExpect(jsonPath("$.school.latitude").isNotEmpty())
				.andExpect(jsonPath("$.school.arrivalTime").isEmpty())
				.andExpect(jsonPath("$.stops.length()").value(0));

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Verdun morning run"))
				.andExpect(jsonPath("$[0].seatsLeft").value(14));
	}

	@Test
	void creatingWithAnInactiveVehicleIsRejected() throws Exception {
		UUID vehicleId = aVehicle(schoolA, false);
		UUID driverId = aDriver(schoolA);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(route("Hamra morning run", vehicleId, driverId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.vehicleId").value("Cannot put a deactivated vehicle on a route."));
		assertEquals(0, routeRepository.count());
	}

	@Test
	void creatingWithADeactivatedDriverIsRejected() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		UUID driverId = aDriver(schoolA, DriverStatus.DEACTIVATED);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(route("Hamra morning run", vehicleId, driverId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.driverId").value("Cannot put a deactivated driver on a route."));
		assertEquals(0, routeRepository.count());
	}

	@Test
	void editingToADeactivatedDriverIsRejected() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID deactivatedDriverId = aDriver(schoolA, DriverStatus.DEACTIVATED);

		mockMvc.perform(put(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run", aVehicle(schoolA, true), deactivatedDriverId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.driverId").value("Cannot put a deactivated driver on a route."));
	}

	@Test
	void creatingWithAVehicleAlreadyOnAnotherRouteIsRejected() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		createAs(schoolA, "Verdun morning run", vehicleId, aDriver(schoolA));

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Hamra morning run", vehicleId, aDriver(schoolA))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.vehicleId")
						.value("Vehicle is already on route \"Verdun morning run\"."));
		assertEquals(1, routeRepository.count());
	}

	@Test
	void creatingWithADriverAlreadyOnAnotherRouteIsRejected() throws Exception {
		UUID driverId = aDriver(schoolA);
		createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), driverId);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Hamra morning run", aVehicle(schoolA, true), driverId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.driverId")
						.value("Driver is already on route \"Verdun morning run\"."));
	}

	@Test
	void nameVehicleIdAndDriverIdAreRequired() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.name").value("Name is required"))
				.andExpect(jsonPath("$.errors.vehicleId").value("Vehicle id is required"))
				.andExpect(jsonPath("$.errors.driverId").value("Driver id is required"));
		assertEquals(0, routeRepository.count());
	}

	@Test
	void creatingWithAnUnknownVehicleOrDriverIsNotFound() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run", UUID.randomUUID(), aDriver(schoolA))))
				.andExpect(status().isNotFound());

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run", aVehicle(schoolA, true), UUID.randomUUID())))
				.andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanGetARoute() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Verdun morning run"));
	}

	@Test
	void gettingAnUnknownOrOtherSchoolRouteIsNotFound() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(get(URL + "/" + UUID.randomUUID()).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNotFound());
		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanEditARoute() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		UUID driverId = aDriver(schoolA);
		String id = createAs(schoolA, "Verdun morning run", vehicleId, driverId);

		UUID newVehicleId = aVehicle(schoolA, true);
		mockMvc.perform(put(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Hamra morning run", newVehicleId, driverId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Hamra morning run"))
				.andExpect(jsonPath("$.vehicle.id").value(newVehicleId.toString()));
	}

	@Test
	void editingARouteToKeepItsOwnVehicleAndDriverIsNotAConflict() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		UUID driverId = aDriver(schoolA);
		String id = createAs(schoolA, "Verdun morning run", vehicleId, driverId);

		mockMvc.perform(put(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run (renamed)", vehicleId, driverId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Verdun morning run (renamed)"));
	}

	@Test
	void editingToAVehicleAlreadyOnAnotherRouteIsRejected() throws Exception {
		UUID takenVehicleId = aVehicle(schoolA, true);
		createAs(schoolA, "Verdun morning run", takenVehicleId, aDriver(schoolA));
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)));
		mockMvc.perform(put(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Hamra morning run", takenVehicleId, aDriver(schoolA))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.vehicleId")
						.value("Vehicle is already on route \"Verdun morning run\"."));
	}

	@Test
	void headOfTransportCanDeleteARoute() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(delete(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNoContent());
		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNotFound());
	}

	@Test
	void deletingAnUnknownOrOtherSchoolRouteIsNotFound() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(delete(URL + "/" + UUID.randomUUID()).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNotFound());
		mockMvc.perform(delete(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(status().isNotFound());
	}

	@Test
	void eachSchoolOnlySeesItsOwnRoutes() throws Exception {
		createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		createAs(schoolB, "Hamra morning run", aVehicle(schoolB, true), aDriver(schoolB));

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Verdun morning run"));
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Hamra morning run"));
	}

	@Test
	void aSchoolCannotUseAnotherSchoolsVehicleOrDriver() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run", aVehicle(schoolB, true), aDriver(schoolA))))
				.andExpect(status().isNotFound());
	}

	@Test
	void nonHeadOfTransportRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.ADMIN, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(get(URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
		}
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
	}
}
