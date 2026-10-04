package com.wassel.backend.students.controller;

import com.wassel.backend.students.repository.StudentRepository;
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
class StudentControllerTests {

	private static final String URL = "/api/head-of-transport/students";

	private final UUID schoolA = UUID.randomUUID();
	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private StudentRepository studentRepository;

	@BeforeEach
	void cleanDatabase() {
		studentRepository.deleteAll();
	}

	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private String student(String firstName, String lastName, String grade, String guardianName,
			String guardianPhone) {
		return "{\"firstName\":\"%s\",\"lastName\":\"%s\",\"grade\":\"%s\",\"guardianName\":\"%s\",\"guardianPhone\":\"%s\"}"
				.formatted(firstName, lastName, grade, guardianName, guardianPhone);
	}

	private void addAs(UUID schoolId, String firstName, String lastName, String grade, String guardianName,
			String guardianPhone) throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(student(firstName, lastName, grade, guardianName, guardianPhone)))
				.andExpect(status().isCreated());
	}

	@Test
	void listIsEmptyBeforeAnyStudentIsAdded() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void headOfTransportCanAddAStudentAndSeeItInTheList() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(student("Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.firstName").value("Layla"))
				.andExpect(jsonPath("$.lastName").value("Chamoun"))
				.andExpect(jsonPath("$.grade").value("Grade 2"))
				.andExpect(jsonPath("$.guardianName").value("Rania Chamoun"))
				.andExpect(jsonPath("$.guardianPhone").value("+961 3 111 222"))
				.andExpect(jsonPath("$.status").value("active"))
				.andExpect(jsonPath("$.createdAt").isNotEmpty());

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Layla"));
	}

	@Test
	void fieldsAreTrimmed() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(student("  Layla  ", "  Chamoun  ", "  Grade 2  ", "  Rania Chamoun  ",
								"  +961 3 111 222  ")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.firstName").value("Layla"))
				.andExpect(jsonPath("$.grade").value("Grade 2"))
				.andExpect(jsonPath("$.guardianPhone").value("+961 3 111 222"));
	}

	@Test
	void allFieldsAreRequiredAndPhoneIsValidated() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.firstName").value("First name is required"))
				.andExpect(jsonPath("$.errors.lastName").value("Last name is required"))
				.andExpect(jsonPath("$.errors.grade").value("Grade is required"))
				.andExpect(jsonPath("$.errors.guardianName").value("Guardian name is required"))
				.andExpect(jsonPath("$.errors.guardianPhone").value("Guardian phone is required"));

		for (String bad : new String[] { "0312345", "961 3 111 222", "+961 311 1222", "+961 3 11 222" }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
							.contentType(MediaType.APPLICATION_JSON)
							.content(student("Layla", "Chamoun", "Grade 2", "Rania Chamoun", bad)))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.guardianPhone")
							.value("Use a format like \"+961 3 123 456\" or \"+961 70 234 567\""));
		}

		assertEquals(0, studentRepository.count());
	}

	@Test
	void aSecondStudentWithTheSameNameAndGuardianPhoneIsRejected() throws Exception {
		addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(student("layla", "chamoun", "Grade 3", "Someone Else", "+961 3 111 222")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.guardianPhone")
						.value("A student named layla chamoun with guardian phone +961 3 111 222 already exists."));

		assertEquals(1, studentRepository.count());
	}

	@Test
	void aDifferentGuardianPhoneIsNotADuplicate() throws Exception {
		addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(student("Layla", "Chamoun", "Grade 2", "Different Guardian", "+961 70 999 888")))
				.andExpect(status().isCreated());

		assertEquals(2, studentRepository.count());
	}

	@Test
	void differentSchoolsCanHaveTheSameStudent() throws Exception {
		addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		addAs(schoolB, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
	}

	@Test
	void eachSchoolOnlySeesItsOwnStudents() throws Exception {
		addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		addAs(schoolB, "Karim", "Nassar", "Grade 4", "Wael Nassar", "+961 70 222 333");

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Layla"));
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Karim"));
	}

	@Test
	void nonHeadOfTransportRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.ADMIN, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(get(URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
			mockMvc.perform(post(URL).with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON)
							.content(student("Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222")))
					.andExpect(status().isForbidden());
		}
		assertEquals(0, studentRepository.count());
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
		mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON)
						.content(student("Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222")))
				.andExpect(status().isUnauthorized());
	}
}
