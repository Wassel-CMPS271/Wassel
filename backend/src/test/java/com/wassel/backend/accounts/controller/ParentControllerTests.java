package com.wassel.backend.accounts.controller;

import com.wassel.backend.auth.service.Mailer;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import com.wassel.backend.users.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ParentControllerTests {

	private static final String URL = "/api/head-of-transport/parents";

	private final UUID schoolA = UUID.randomUUID();
	private final UUID schoolB = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private UserService userService;

	@Autowired
	private StudentRepository studentRepository;

	@MockitoBean
	private Mailer mailer;

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

	private String body(String email) {
		return "{\"email\":\"%s\"}".formatted(email);
	}

	private String inviteAs(UUID schoolId, String email) throws Exception {
		String response = mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
						.contentType(MediaType.APPLICATION_JSON).content(body(email)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		Matcher matcher = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(response);
		matcher.find();
		return matcher.group(1);
	}

	private String lastToken() {
		ArgumentCaptor<String> mail = ArgumentCaptor.forClass(String.class);
		verify(mailer, atLeastOnce()).send(anyString(), anyString(), mail.capture());
		Matcher matcher = Pattern.compile("token=([\\w-]+)").matcher(mail.getValue());
		assertTrue(matcher.find());
		return matcher.group(1);
	}

	@Test
	void listIsEmptyBeforeAnyParentIsInvited() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void headOfTransportCanInviteAParentAndSeeThemInTheList() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(body("  Rania.Chamoun@Example.com ")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.email").value("rania.chamoun@example.com"))
				.andExpect(jsonPath("$.status").value("invited"))
				.andExpect(jsonPath("$.createdAt").isNotEmpty());

		User saved = userRepository.findByEmailIgnoreCase("rania.chamoun@example.com").orElseThrow();
		assertEquals(Role.PARENT, saved.getRole());
		assertEquals(schoolA, saved.getSchoolId());
		verify(mailer, times(1)).send(eq("rania.chamoun@example.com"), anyString(),
				contains("/set-password?token="));

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].email").value("rania.chamoun@example.com"));
	}

	@Test
	void theEmailIsRequiredAndValidated() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").value("Email is required"));

		for (String bad : new String[] { "not-an-email", "missing-at.example.com", "no-domain@" }) {
			mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(body(bad)))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.email").value("Enter a valid email address"));
		}

		assertEquals(0, userRepository.count());
	}

	@Test
	void anEmailAlreadyUsedByAnyAccountIsAConflict() throws Exception {
		userService.createUser("taken@example.com", "a-long-enough-password", Role.DRIVER, schoolB);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(body("Taken@example.com")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.email").value("An account with this email already exists."));

		assertEquals(1, userRepository.count());
	}

	@Test
	void eachSchoolOnlySeesItsOwnParentsAndNoOtherRoles() throws Exception {
		inviteAs(schoolA, "a-parent@example.com");
		inviteAs(schoolB, "b-parent@example.com");
		userService.createInvitedUser("a-driver@example.com", Role.DRIVER, schoolA);

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].email").value("a-parent@example.com"));
	}

	@Test
	void theStatusBecomesActiveOnceTheParentSetsAPassword() throws Exception {
		inviteAs(schoolA, "rania.chamoun@example.com");

		mockMvc.perform(post("/api/auth/password").contentType(MediaType.APPLICATION_JSON)
						.content("{\"token\":\"%s\",\"password\":\"a-brand-new-password\"}".formatted(lastToken())))
				.andExpect(status().isNoContent());

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$[0].status").value("active"));
	}

	@Test
	void anInvitedParentCanBeLinkedToAStudent() throws Exception {
		String parentId = inviteAs(schoolA, "rania.chamoun@example.com");
		UUID studentId = studentRepository.saveAndFlush(Student.builder().schoolId(schoolA).firstName("Layla")
				.lastName("Chamoun").grade("Grade 2").guardianName("Rania Chamoun")
				.guardianPhone("+961 3 111 222").status(StudentStatus.ACTIVE).build()).getId();

		mockMvc.perform(patch("/api/head-of-transport/students/" + studentId + "/parent")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"parentUserId\":\"%s\"}".formatted(parentId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.parentUserId").value(parentId));
	}

	@Test
	void nonHeadOfTransportRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.ADMIN, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(get(URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
			mockMvc.perform(post(URL).with(loggedInAs(role, schoolA))
							.contentType(MediaType.APPLICATION_JSON).content(body("rania.chamoun@example.com")))
					.andExpect(status().isForbidden());
		}
		assertEquals(0, userRepository.count());
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
		mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("rania.chamoun@example.com")))
				.andExpect(status().isUnauthorized());
	}
}
