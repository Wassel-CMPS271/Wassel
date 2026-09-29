package com.wassel.backend.drivers.controller;

import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DriverControllerTests {

	private static final String URL = "/api/head-of-transport/drivers";

	private final UUID schoolA = UUID.randomUUID();
	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private DriverRepository driverRepository;

	@Autowired
	private VehicleRepository vehicleRepository;

	@BeforeEach
	void cleanDatabase() {
		driverRepository.deleteAll();
		vehicleRepository.deleteAll();
	}

	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private String driver(String firstName, String lastName, String phone, String email) {
		return "{\"firstName\":\"%s\",\"lastName\":\"%s\",\"phone\":\"%s\",\"email\":\"%s\"}"
				.formatted(firstName, lastName, phone, email);
	}

	private String addAs(UUID schoolId, String firstName, String lastName, String phone, String email)
			throws Exception {
		String body = mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
						.contentType(MediaType.APPLICATION_JSON).content(driver(firstName, lastName, phone, email)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		Matcher matcher = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(body);
		matcher.find();
		return matcher.group(1);
	}

	private UUID saveVehicle(UUID schoolId, String plateNumber, boolean active) {
		Vehicle vehicle = Vehicle.builder().schoolId(schoolId).plateNumber(plateNumber).capacity(14)
				.active(active).build();
		return vehicleRepository.saveAndFlush(vehicle).getId();
	}

	@Test
	void listIsEmptyBeforeAnyDriverIsAdded() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void headOfTransportCanAddADriverAndSeeItInTheList() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(driver("Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.firstName").value("Ahmad"))
				.andExpect(jsonPath("$.lastName").value("Khalil"))
				.andExpect(jsonPath("$.phone").value("+961 3 123 456"))
				.andExpect(jsonPath("$.email").value("ahmad.khalil@example.com"))
				.andExpect(jsonPath("$.status").value("invited"))
				.andExpect(jsonPath("$.invitedAt").isNotEmpty())
				.andExpect(jsonPath("$.assignedVehicleId").doesNotExist());

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].email").value("ahmad.khalil@example.com"));
	}

	@Test
	void fieldsAreTrimmed() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(driver("  Ahmad  ", "  Khalil  ", "  +961 3 123 456  ",
								"  ahmad.khalil@example.com  ")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.firstName").value("Ahmad"))
				.andExpect(jsonPath("$.phone").value("+961 3 123 456"))
				.andExpect(jsonPath("$.email").value("ahmad.khalil@example.com"));
	}

	@Test
	void allFieldsAreRequiredAndValidated() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.firstName").value("First name is required"))
				.andExpect(jsonPath("$.errors.lastName").value("Last name is required"))
				.andExpect(jsonPath("$.errors.phone").value("Phone number is required"))
				.andExpect(jsonPath("$.errors.email").value("Email is required"));

		for (String bad : new String[] { "0312345", "961 3 123 456", "+961 312 3456", "+961 3 12 456" }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
							.contentType(MediaType.APPLICATION_JSON)
							.content(driver("Ahmad", "Khalil", bad, "ahmad.khalil@example.com")))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.phone")
							.value("Use a format like \"+961 3 123 456\" or \"+961 70 234 567\""));
		}

		for (String bad : new String[] { "not-an-email", "missing-at.example.com", "no-domain@" }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
							.contentType(MediaType.APPLICATION_JSON)
							.content(driver("Ahmad", "Khalil", "+961 3 123 456", bad)))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.email").value("Enter a valid email address"));
		}

		assertEquals(0, driverRepository.count());
	}

	@Test
	void aSecondDriverWithTheSameEmailIsRejected() throws Exception {
		addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(driver("Sara", "Haddad", "+961 70 234 567", "ahmad.khalil@example.com")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.email").value("A driver with that email already exists."));

		assertEquals(1, driverRepository.count());
	}

	@Test
	void aSecondDriverWithTheSamePhoneIsRejected() throws Exception {
		addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(driver("Sara", "Haddad", "+961 3 123 456", "sara.haddad@example.com")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.phone").value("A driver with that phone number already exists."));

		assertEquals(1, driverRepository.count());
	}

	@Test
	void differentSchoolsCanHaveDriversWithTheSameEmailAndPhone() throws Exception {
		addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");
		addAs(schoolB, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");
	}

	@Test
	void eachSchoolOnlySeesItsOwnDrivers() throws Exception {
		addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");
		addAs(schoolB, "Sara", "Haddad", "+961 70 234 567", "sara.haddad@example.com");

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].email").value("ahmad.khalil@example.com"));
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].email").value("sara.haddad@example.com"));
	}

	@Test
	void headOfTransportCanResendAnInvite() throws Exception {
		String id = addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");

		mockMvc.perform(patch(URL + "/" + id + "/resend-invite").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("invited"));
	}

	@Test
	void resendingAnInviteToANonInvitedDriverIsAConflict() throws Exception {
		Driver driver = Driver.builder().schoolId(schoolA).firstName("Ahmad").lastName("Khalil")
				.phone("+961 3 123 456").email("ahmad.khalil@example.com").status(DriverStatus.ACTIVE)
				.invitedAt(Instant.now()).build();
		UUID id = driverRepository.saveAndFlush(driver).getId();

		mockMvc.perform(patch(URL + "/" + id + "/resend-invite").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.status").value("Cannot resend invite: driver is already active."));
	}

	@Test
	void resendingAnInviteToAnUnknownOrOtherSchoolDriverIsNotFound() throws Exception {
		String id = addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");

		mockMvc.perform(patch(URL + "/" + UUID.randomUUID() + "/resend-invite")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNotFound());
		mockMvc.perform(patch(URL + "/" + id + "/resend-invite").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanAssignAndUnassignAVehicle() throws Exception {
		String driverId = addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");
		UUID vehicleId = saveVehicle(schoolA, "A 123456", true);

		mockMvc.perform(patch(URL + "/" + driverId + "/vehicle").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"vehicleId\":\"%s\"}".formatted(vehicleId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.assignedVehicleId").value(vehicleId.toString()));

		mockMvc.perform(delete(URL + "/" + driverId + "/vehicle").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.assignedVehicleId").doesNotExist());
	}

	@Test
	void assigningAnUnknownOrOtherSchoolVehicleIsNotFound() throws Exception {
		String driverId = addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");
		UUID otherSchoolVehicleId = saveVehicle(schoolB, "B 234567", true);

		mockMvc.perform(patch(URL + "/" + driverId + "/vehicle").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"vehicleId\":\"%s\"}".formatted(UUID.randomUUID())))
				.andExpect(status().isNotFound());
		mockMvc.perform(patch(URL + "/" + driverId + "/vehicle").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"vehicleId\":\"%s\"}".formatted(otherSchoolVehicleId)))
				.andExpect(status().isNotFound());
	}

	@Test
	void assigningADeactivatedVehicleIsAConflict() throws Exception {
		String driverId = addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");
		UUID vehicleId = saveVehicle(schoolA, "A 123456", false);

		mockMvc.perform(patch(URL + "/" + driverId + "/vehicle").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"vehicleId\":\"%s\"}".formatted(vehicleId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.vehicleId").value("Cannot assign a driver to a deactivated vehicle."));
	}

	@Test
	void assigningAVehicleAlreadyTakenByAnotherDriverIsAConflict() throws Exception {
		String firstDriverId = addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");
		String secondDriverId = addAs(schoolA, "Sara", "Haddad", "+961 70 234 567", "sara.haddad@example.com");
		UUID vehicleId = saveVehicle(schoolA, "A 123456", true);

		mockMvc.perform(patch(URL + "/" + firstDriverId + "/vehicle").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"vehicleId\":\"%s\"}".formatted(vehicleId)))
				.andExpect(status().isOk());

		mockMvc.perform(patch(URL + "/" + secondDriverId + "/vehicle").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"vehicleId\":\"%s\"}".formatted(vehicleId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.vehicleId").value("Vehicle is already assigned to Ahmad Khalil."));
	}

	@Test
	void assigningADeactivatedDriverIsAConflict() throws Exception {
		Driver driver = Driver.builder().schoolId(schoolA).firstName("Nour").lastName("Saleh")
				.phone("+961 76 456 789").email("nour.saleh@example.com").status(DriverStatus.DEACTIVATED)
				.invitedAt(Instant.now()).build();
		UUID driverId = driverRepository.saveAndFlush(driver).getId();
		UUID vehicleId = saveVehicle(schoolA, "A 123456", true);

		mockMvc.perform(patch(URL + "/" + driverId + "/vehicle").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"vehicleId\":\"%s\"}".formatted(vehicleId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.status").value("Cannot assign a deactivated driver to a vehicle."));
	}

	@Test
	void unassigningAnUnknownOrOtherSchoolDriverIsNotFound() throws Exception {
		String driverId = addAs(schoolA, "Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com");

		mockMvc.perform(delete(URL + "/" + UUID.randomUUID() + "/vehicle")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNotFound());
		mockMvc.perform(delete(URL + "/" + driverId + "/vehicle").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(status().isNotFound());
	}

	@Test
	void nonHeadOfTransportRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.ADMIN, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(get(URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
			mockMvc.perform(post(URL).with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON)
							.content(driver("Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com")))
					.andExpect(status().isForbidden());
		}
		assertEquals(0, driverRepository.count());
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
		mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON)
						.content(driver("Ahmad", "Khalil", "+961 3 123 456", "ahmad.khalil@example.com")))
				.andExpect(status().isUnauthorized());
	}
}
