package com.wassel.backend.schools.controller;

import com.wassel.backend.schools.repository.SchoolSettingsRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
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

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SchoolSettingsControllerTests {

	private static final String URL = "/api/admin/school-settings/times";

	private final UUID schoolA = UUID.randomUUID();
	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private SchoolSettingsRepository schoolSettingsRepository;

	@BeforeEach
	void cleanDatabase() {
		schoolSettingsRepository.deleteAll();
	}

	// The security context holds the User as principal (see SchoolSettingsController).
	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private String times(String arrival, String dismissal) {
		return "{\"arrivalTime\":\"%s\",\"dismissalTime\":\"%s\"}".formatted(arrival, dismissal);
	}

	@Test
	void getReturnsNullTimesBeforeTheyAreSet() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.arrivalTime").isEmpty())
				.andExpect(jsonPath("$.dismissalTime").isEmpty());
	}

	@Test
	void adminCanSetTimesAndReadThemBack() throws Exception {
		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(times("07:30", "14:45")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.arrivalTime").value("07:30"))
				.andExpect(jsonPath("$.dismissalTime").value("14:45"));

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.arrivalTime").value("07:30"))
				.andExpect(jsonPath("$.dismissalTime").value("14:45"));
	}

	@Test
	void updatingReplacesThePreviousTimes() throws Exception {
		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
				.contentType(MediaType.APPLICATION_JSON).content(times("07:30", "14:45")));
		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(times("08:00", "15:00")))
				.andExpect(status().isOk());

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(jsonPath("$.arrivalTime").value("08:00"))
				.andExpect(jsonPath("$.dismissalTime").value("15:00"));
	}

	@Test
	void dismissalMustBeAfterArrival() throws Exception {
		for (String[] pair : new String[][] { { "14:45", "07:30" }, { "08:00", "08:00" } }) {
			mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(times(pair[0], pair[1])))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.dismissalTime").value("Dismissal time must be after arrival time."));
		}
	}

	@Test
	void rejectedUpdateLeavesStoredTimesUnchanged() throws Exception {
		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
				.contentType(MediaType.APPLICATION_JSON).content(times("07:30", "14:45")));
		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(times("16:00", "09:00")))
				.andExpect(status().isBadRequest());

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(jsonPath("$.arrivalTime").value("07:30"))
				.andExpect(jsonPath("$.dismissalTime").value("14:45"));
	}

	@Test
	void bothTimesAreRequired() throws Exception {
		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"dismissalTime\":\"14:45\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.arrivalTime").value("Arrival time is required"));

		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"arrivalTime\":\"07:30\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.dismissalTime").value("Dismissal time is required"));
	}

	@Test
	void malformedTimesAreABadRequestNotAServerError() throws Exception {
		for (String bad : new String[] { "25:00", "7:30 AM", "abc", "07:30:15" }) {
			mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(times(bad, "14:45")))
					.andExpect(status().isBadRequest());
		}
		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{not json"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void eachSchoolOnlySeesAndChangesItsOwnTimes() throws Exception {
		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolA))
				.contentType(MediaType.APPLICATION_JSON).content(times("07:30", "14:45")));
		mockMvc.perform(put(URL).with(loggedInAs(Role.ADMIN, schoolB))
				.contentType(MediaType.APPLICATION_JSON).content(times("08:15", "13:00")));

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(jsonPath("$.arrivalTime").value("07:30"))
				.andExpect(jsonPath("$.dismissalTime").value("14:45"));
		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolB)))
				.andExpect(jsonPath("$.arrivalTime").value("08:15"))
				.andExpect(jsonPath("$.dismissalTime").value("13:00"));
	}

	@Test
	void nonAdminRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.HEAD_OF_TRANSPORT, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(get(URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
			mockMvc.perform(put(URL).with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(times("07:30", "14:45")))
					.andExpect(status().isForbidden());
		}
		org.junit.jupiter.api.Assertions.assertEquals(0, schoolSettingsRepository.count());
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
		mockMvc.perform(put(URL).contentType(MediaType.APPLICATION_JSON).content(times("07:30", "14:45")))
				.andExpect(status().isUnauthorized());
	}
}
