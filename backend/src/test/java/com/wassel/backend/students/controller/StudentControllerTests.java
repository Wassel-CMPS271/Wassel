package com.wassel.backend.students.controller;

import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
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
class StudentControllerTests {

	private static final String URL = "/api/head-of-transport/students";

	private final UUID schoolA = UUID.randomUUID();
	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private StudentRepository studentRepository;

	@Autowired
	private UserRepository userRepository;

	@BeforeEach
	void cleanDatabase() {
		studentRepository.deleteAll();
		userRepository.deleteAll();
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

	private String addAs(UUID schoolId, String firstName, String lastName, String grade, String guardianName,
			String guardianPhone) throws Exception {
		String body = mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(student(firstName, lastName, grade, guardianName, guardianPhone)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		Matcher matcher = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(body);
		matcher.find();
		return matcher.group(1);
	}

	private UUID saveStudentWithRoute(UUID schoolId, String firstName, String route) {
		Student entity = Student.builder().schoolId(schoolId).firstName(firstName).lastName("Test")
				.grade("Grade 1").guardianName("Guardian").guardianPhone("+961 3 000 000")
				.status(StudentStatus.ACTIVE).route(route).build();
		return studentRepository.saveAndFlush(entity).getId();
	}

	private UUID saveParent(UUID schoolId) {
		User parent = User.builder().email("parent-" + UUID.randomUUID() + "@wassel.test").passwordHash("x")
				.role(Role.PARENT).schoolId(schoolId).build();
		return userRepository.saveAndFlush(parent).getId();
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

	@Test
	void newlyAddedStudentHasNoEditableFieldsSetYet() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$[0].id").value(id))
				.andExpect(jsonPath("$[0].address").doesNotExist())
				.andExpect(jsonPath("$[0].latitude").doesNotExist())
				.andExpect(jsonPath("$[0].longitude").doesNotExist())
				.andExpect(jsonPath("$[0].route").doesNotExist())
				.andExpect(jsonPath("$[0].parentUserId").doesNotExist());
	}

	@Test
	void headOfTransportCanUpdateAStudentsAddress() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(patch(URL + "/" + id + "/address").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"address\":\"  Hamra Street, Beirut  \"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.address").value("Hamra Street, Beirut"));
	}

	@Test
	void updatingAddressRequiresANonBlankValue() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(patch(URL + "/" + id + "/address").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"address\":\"   \"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.address").value("Address is required"));
	}

	@Test
	void updatingAddressForUnknownOrOtherSchoolStudentIsNotFound() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(patch(URL + "/" + UUID.randomUUID() + "/address")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)).contentType(MediaType.APPLICATION_JSON)
						.content("{\"address\":\"Hamra Street\"}"))
				.andExpect(status().isNotFound());
		mockMvc.perform(patch(URL + "/" + id + "/address").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB))
						.contentType(MediaType.APPLICATION_JSON).content("{\"address\":\"Hamra Street\"}"))
				.andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanCorrectAStudentsMapPin() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(patch(URL + "/" + id + "/location").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"latitude\":33.8938,\"longitude\":35.5018}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.latitude").value(33.8938))
				.andExpect(jsonPath("$.longitude").value(35.5018));
	}

	@Test
	void locationMustBeWithinValidLatitudeAndLongitudeRanges() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(patch(URL + "/" + id + "/location").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"latitude\":91,\"longitude\":200}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.latitude").value("Latitude must be between -90 and 90"))
				.andExpect(jsonPath("$.errors.longitude").value("Longitude must be between -180 and 180"));
	}

	@Test
	void updatingLocationForUnknownOrOtherSchoolStudentIsNotFound() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(patch(URL + "/" + UUID.randomUUID() + "/location")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)).contentType(MediaType.APPLICATION_JSON)
						.content("{\"latitude\":33.8938,\"longitude\":35.5018}"))
				.andExpect(status().isNotFound());
		mockMvc.perform(patch(URL + "/" + id + "/location").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"latitude\":33.8938,\"longitude\":35.5018}"))
				.andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanLinkAParentToAStudent() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		UUID parentId = saveParent(schoolA);

		mockMvc.perform(patch(URL + "/" + id + "/parent").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"parentUserId\":\"%s\"}".formatted(parentId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.parentUserId").value(parentId.toString()));
	}

	@Test
	void linkingAUserThatIsNotAParentIsNotFound() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		User notAParent = User.builder().email("hot@wassel.test").passwordHash("x")
				.role(Role.HEAD_OF_TRANSPORT).schoolId(schoolA).build();
		UUID notAParentId = userRepository.saveAndFlush(notAParent).getId();

		mockMvc.perform(patch(URL + "/" + id + "/parent").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"parentUserId\":\"%s\"}".formatted(notAParentId)))
				.andExpect(status().isNotFound());
	}

	@Test
	void linkingAParentFromAnotherSchoolIsNotFound() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		UUID otherSchoolParentId = saveParent(schoolB);

		mockMvc.perform(patch(URL + "/" + id + "/parent").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"parentUserId\":\"%s\"}".formatted(otherSchoolParentId)))
				.andExpect(status().isNotFound());
	}

	@Test
	void linkingAParentForUnknownOrOtherSchoolStudentIsNotFound() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		UUID parentId = saveParent(schoolA);
		UUID parentOfSchoolB = saveParent(schoolB);

		mockMvc.perform(patch(URL + "/" + UUID.randomUUID() + "/parent")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)).contentType(MediaType.APPLICATION_JSON)
						.content("{\"parentUserId\":\"%s\"}".formatted(parentId)))
				.andExpect(status().isNotFound());
		mockMvc.perform(patch(URL + "/" + id + "/parent").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"parentUserId\":\"%s\"}".formatted(parentOfSchoolB)))
				.andExpect(status().isNotFound());
	}

	@Test
	void editEndpointsAreForbiddenForNonHeadOfTransportRoles() throws Exception {
		String id = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		for (Role role : new Role[] { Role.ADMIN, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(patch(URL + "/" + id + "/address").with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content("{\"address\":\"Hamra Street\"}"))
					.andExpect(status().isForbidden());
			mockMvc.perform(patch(URL + "/" + id + "/location").with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON)
							.content("{\"latitude\":33.8938,\"longitude\":35.5018}"))
					.andExpect(status().isForbidden());
			mockMvc.perform(patch(URL + "/" + id + "/parent").with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON)
							.content("{\"parentUserId\":\"%s\"}".formatted(UUID.randomUUID())))
					.andExpect(status().isForbidden());
		}
	}

	@Test
	void searchFiltersByQueryAcrossNameAndGuardian() throws Exception {
		addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		addAs(schoolA, "Karim", "Nassar", "Grade 4", "Wael Nassar", "+961 70 222 333");

		mockMvc.perform(get(URL).param("query", "chamoun").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Layla"));
		mockMvc.perform(get(URL).param("query", "wael").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Karim"));
		mockMvc.perform(get(URL).param("query", "nobody").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void searchFiltersByStatus() throws Exception {
		String activeId = addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		Student inactive = Student.builder().schoolId(schoolA).firstName("Karim").lastName("Nassar")
				.grade("Grade 4").guardianName("Wael Nassar").guardianPhone("+961 70 222 333")
				.status(StudentStatus.INACTIVE).build();
		studentRepository.saveAndFlush(inactive);

		mockMvc.perform(get(URL).param("status", "active").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].id").value(activeId));
		mockMvc.perform(get(URL).param("status", "inactive").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Karim"));
		mockMvc.perform(get(URL).param("status", "all").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(2));
	}

	@Test
	void searchFiltersByGrade() throws Exception {
		addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		addAs(schoolA, "Karim", "Nassar", "Grade 4", "Wael Nassar", "+961 70 222 333");

		mockMvc.perform(get(URL).param("grade", "Grade 4").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Karim"));
	}

	@Test
	void searchFiltersByRoute() throws Exception {
		saveStudentWithRoute(schoolA, "Layla", "Route A");
		saveStudentWithRoute(schoolA, "Karim", "Route B");
		saveStudentWithRoute(schoolA, "Maya", null);

		mockMvc.perform(get(URL).param("route", "Route A").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].firstName").value("Layla"));
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(3));
	}

	@Test
	void searchIsScopedToTheCallersSchool() throws Exception {
		addAs(schoolA, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");
		addAs(schoolB, "Layla", "Chamoun", "Grade 2", "Rania Chamoun", "+961 3 111 222");

		mockMvc.perform(get(URL).param("query", "layla").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1));
	}
}
