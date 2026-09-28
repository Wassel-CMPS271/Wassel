package com.wassel.backend.vehicles.controller;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
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

	@BeforeEach
	void cleanDatabase() {
		vehicleRepository.deleteAll();
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
