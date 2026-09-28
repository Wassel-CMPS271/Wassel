package com.wassel.backend.schools.controller;

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
class HolidayControllerTests {

	private static final String URL = "/api/admin/school-calendar/holidays";

	private final UUID schoolA = UUID.randomUUID();
	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private HolidayRepository holidayRepository;

	@BeforeEach
	void cleanDatabase() {
		holidayRepository.deleteAll();
	}

	// The security context holds the User as principal (see SchoolSettingsController).
	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private String holiday(String date, String name) {
		return "{\"date\":\"%s\",\"name\":\"%s\"}".formatted(date, name);
	}

	private void addAs(UUID schoolId, String date, String name) throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolId))
						.contentType(MediaType.APPLICATION_JSON).content(holiday(date, name)))
				.andExpect(status().isCreated());
	}

	@Test
	void listIsEmptyBeforeAnyHolidayIsAdded() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void adminCanAddAHolidayAndSeeItInTheList() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(holiday("2026-12-25", "Christmas Day")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.date").value("2026-12-25"))
				.andExpect(jsonPath("$.name").value("Christmas Day"));

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].date").value("2026-12-25"))
				.andExpect(jsonPath("$[0].name").value("Christmas Day"));
	}

	@Test
	void holidaysAreListedEarliestFirstWhateverTheAddOrder() throws Exception {
		addAs(schoolA, "2026-12-25", "Christmas Day");
		addAs(schoolA, "2026-05-01", "Labour Day");
		addAs(schoolA, "2026-11-22", "Independence Day");

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(jsonPath("$[0].date").value("2026-05-01"))
				.andExpect(jsonPath("$[1].date").value("2026-11-22"))
				.andExpect(jsonPath("$[2].date").value("2026-12-25"));
	}

	@Test
	void theNameIsTrimmed() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(holiday("2026-05-01", "  Labour Day  ")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.name").value("Labour Day"));
	}

	@Test
	void aSecondHolidayOnTheSameDateIsRejectedAndTheFirstIsKept() throws Exception {
		addAs(schoolA, "2026-12-25", "Christmas Day");

		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(holiday("2026-12-25", "Something else")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.date").value("A holiday is already set for that date."));

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Christmas Day"));
	}

	@Test
	void differentSchoolsCanHaveAHolidayOnTheSameDate() throws Exception {
		addAs(schoolA, "2026-12-25", "Christmas Day");
		addAs(schoolB, "2026-12-25", "Winter closure");
	}

	@Test
	void eachSchoolOnlySeesItsOwnHolidays() throws Exception {
		addAs(schoolA, "2026-05-01", "Labour Day");
		addAs(schoolB, "2026-11-22", "Independence Day");

		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Labour Day"));
		mockMvc.perform(get(URL).with(loggedInAs(Role.ADMIN, schoolB)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Independence Day"));
	}

	@Test
	void dateAndNameAreRequired() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Labour Day\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.date").value("Date is required"));

		for (String body : new String[] { "{\"date\":\"2026-05-01\"}",
				"{\"date\":\"2026-05-01\",\"name\":\"\"}", "{\"date\":\"2026-05-01\",\"name\":\"   \"}" }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(body))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.name").value("Name is required"));
		}
		assertEquals(0, holidayRepository.count());
	}

	@Test
	void theNameHasALengthLimit() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(holiday("2026-05-01", "x".repeat(101))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.name").value("Name must be at most 100 characters"));

		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(holiday("2026-05-01", "x".repeat(100))))
				.andExpect(status().isCreated());
	}

	@Test
	void malformedOrImpossibleDatesAreABadRequestAndNothingIsSaved() throws Exception {
		for (String bad : new String[] { "2026-13-01", "2026-02-30", "25/12/2026", "Dec 25 2026", "abc" }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(holiday(bad, "Christmas Day")))
					.andExpect(status().isBadRequest());
		}
		mockMvc.perform(post(URL).with(loggedInAs(Role.ADMIN, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{not json"))
				.andExpect(status().isBadRequest());
		assertEquals(0, holidayRepository.count());
	}

	@Test
	void nonAdminRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.HEAD_OF_TRANSPORT, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(get(URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
			mockMvc.perform(post(URL).with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(holiday("2026-12-25", "Christmas Day")))
					.andExpect(status().isForbidden());
		}
		assertEquals(0, holidayRepository.count());
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
		mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(holiday("2026-12-25", "Christmas Day")))
				.andExpect(status().isUnauthorized());
	}
}
