package com.wassel.backend.schools.controller;

import com.wassel.backend.schools.repository.HalfDayRepository;
import com.wassel.backend.schools.repository.HolidayRepository;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HalfDayControllerTests {

	private static final String URL = "/api/admin/school-calendar/half-days";
	private static final String HOLIDAYS_URL = "/api/admin/school-calendar/holidays";

	private final UUID schoolA = UUID.randomUUID();
	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private HalfDayRepository halfDayRepository;

	@Autowired
	private HolidayRepository holidayRepository;

	@BeforeEach
	void cleanDatabase() {
		halfDayRepository.deleteAll();
		holidayRepository.deleteAll();
	}

	// The security context holds the User as principal (see SchoolSettingsController).
	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private String halfDay(String date) {
		return "{\"date\":\"%s\"}".formatted(date);
	}

	private void addAs(UUID schoolId, String date) throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolId))
						.contentType(MediaType.APPLICATION_JSON).content(halfDay(date)))
				.andExpect(status().isCreated());
	}

	private void addHolidayAs(UUID schoolId, String date) throws Exception {
		mockMvc.perform(post(HOLIDAYS_URL).with(loggedInAs(Role.ADMIN, schoolId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"date\":\"%s\",\"name\":\"Closed\"}".formatted(date)))
				.andExpect(status().isCreated());
	}

	@Test
	void listIsEmptyBeforeAnyHalfDayIsMarked() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void adminCanMarkAHalfDayAndSeeItInTheList() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(halfDay("2026-12-24")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.date").value("2026-12-24"));

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].date").value("2026-12-24"));
	}

	@Test
	void halfDaysAreListedEarliestFirstWhateverTheAddOrder() throws Exception {
		addAs(schoolA, "2026-12-24");
		addAs(schoolA, "2026-05-08");
		addAs(schoolA, "2026-10-30");

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(jsonPath("$[0].date").value("2026-05-08"))
				.andExpect(jsonPath("$[1].date").value("2026-10-30"))
				.andExpect(jsonPath("$[2].date").value("2026-12-24"));
	}

	@Test
	void aDateCannotBeMarkedAHalfDayTwice() throws Exception {
		addAs(schoolA, "2026-12-24");

		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(halfDay("2026-12-24")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.date").value("That date is already marked as a half-day."));

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void aHolidayCannotBeMarkedAsAHalfDay() throws Exception {
		addHolidayAs(schoolA, "2026-12-25");

		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(halfDay("2026-12-25")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.date")
						.value("That date is a holiday, so it can't also be a half-day."));

		assertEquals(0, halfDayRepository.count());
	}

	@Test
	void anotherSchoolsHolidayDoesNotBlockAHalfDay() throws Exception {
		addHolidayAs(schoolB, "2026-12-25");
		addAs(schoolA, "2026-12-25");
	}

	@Test
	void differentSchoolsCanMarkTheSameDate() throws Exception {
		addAs(schoolA, "2026-12-24");
		addAs(schoolB, "2026-12-24");
	}

	@Test
	void eachSchoolOnlySeesItsOwnHalfDays() throws Exception {
		addAs(schoolA, "2026-05-08");
		addAs(schoolB, "2026-10-30");

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].date").value("2026-05-08"));
		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolB)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].date").value("2026-10-30"));
	}

	@Test
	void dateIsRequired() throws Exception {
		for (String body : new String[] { "{}", "{\"date\":null}" }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(body))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.date").value("Date is required"));
		}
		assertEquals(0, halfDayRepository.count());
	}

	@Test
	void malformedOrImpossibleDatesAreABadRequestAndNothingIsSaved() throws Exception {
		for (String bad : new String[] { "2026-13-01", "2026-02-30", "24/12/2026", "Dec 24 2026", "abc" }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(halfDay(bad)))
					.andExpect(status().isBadRequest());
		}
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{not json"))
				.andExpect(status().isBadRequest());
		assertEquals(0, halfDayRepository.count());
	}

	@Test
	void nonAdminRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.HEAD_OF_TRANSPORT, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(get(URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
			mockMvc.perform(post(URL).with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(halfDay("2026-12-24")))
					.andExpect(status().isForbidden());
		}
		assertEquals(0, halfDayRepository.count());
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
		mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(halfDay("2026-12-24")))
				.andExpect(status().isUnauthorized());
	}
}
