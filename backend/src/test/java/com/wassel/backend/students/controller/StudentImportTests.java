package com.wassel.backend.students.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.geocoding.service.Geocoder;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.Test;
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

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-300 through the real endpoint and database, replaying the samples of docs/contracts/students-import.md: what
 * the contract says about a request, a retry and a malformed request is what the endpoint answers. Every test uses its
 * own school, so nothing is deleted.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class StudentImportTests {

	private static final String URL = "/api/head-of-transport/students";

	private static final String IMPORT = URL + "/import";

	private static final Path SAMPLES = Path.of("../docs/contracts/samples/students-import/");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private StudentRepository studentRepository;

	@MockitoBean
	private Geocoder geocoder;

	private static RequestPostProcessor headOf(UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email("head@wassel.test").passwordHash("x")
				.role(Role.HEAD_OF_TRANSPORT).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_HEAD_OF_TRANSPORT"))));
	}

	private static String sample(String name) throws Exception {
		return Files.readString(SAMPLES.resolve(name));
	}

	private String importAs(UUID school, String body) throws Exception {
		return mockMvc.perform(post(IMPORT).with(headOf(school)).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	/** The part of an answer the samples fix exactly: counts, and per row its status and errors (ids and times differ). */
	private static Map<String, Object> shape(String json) {
		List<Map<String, Object>> results = JsonPath.read(json, "$.results");
		return Map.of("created", JsonPath.read(json, "$.created"), "rejected", JsonPath.read(json, "$.rejected"),
				"results", results.stream().map(r -> Map.of("row", r.get("row"), "status", r.get("status"),
						"errors", r.getOrDefault("errors", Map.of()))).collect(Collectors.toList()));
	}

	private Student rosterStudent(UUID school, String first, String last, String phone, StudentStatus status) {
		return studentRepository.saveAndFlush(Student.builder().schoolId(school).firstName(first).lastName(last)
				.grade("4").guardianName("Maya Mansour").guardianPhone(phone).status(status).build());
	}

	@Test
	void theSampleRequestGivesTheSampleAnswerAndSendingItAgainCreatesNobody() throws Exception {
		UUID school = UUID.randomUUID();
		// Row 7 of the sample is Tarek Mansour of roster/student-paused.json: already there, and paused (any status counts).
		rosterStudent(school, "Tarek", "Mansour", "+961 3 411 001", StudentStatus.PAUSED);

		String first = importAs(school, sample("request.json"));
		assertEquals(shape(sample("response-partial.json")), shape(first));

		String second = importAs(school, sample("request.json"));
		assertEquals(shape(sample("response-all-rejected.json")), shape(second));
		verifyNoInteractions(geocoder);
	}

	@Test
	void createdStudentsAreActiveTrimmedWithNoAddressRouteOrParentAndAppearInTheRoster() throws Exception {
		UUID school = UUID.randomUUID();
		String answer = importAs(school, sample("request-all-created.json"));

		assertEquals(shape(sample("response-all-created.json")), shape(answer));
		mockMvc.perform(get(URL).with(headOf(school))).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].status").value("active"))
				.andExpect(jsonPath("$[0].address").isEmpty())
				.andExpect(jsonPath("$[0].route").isEmpty())
				// Both were created in one transaction, so their order in the roster is not asserted.
				.andExpect(jsonPath("$[?(@.grade == 'Grade 5')]").isNotEmpty());
	}

	@Test
	void anotherSchoolsStudentIsNotADuplicate() throws Exception {
		UUID other = UUID.randomUUID();
		rosterStudent(other, "Zeina", "Fakhoury", "+961 3 222 111", StudentStatus.ACTIVE);

		String answer = importAs(UUID.randomUUID(), sample("request-all-created.json"));

		assertEquals(2, (int) JsonPath.read(answer, "$.created"));
	}

	@Test
	void aLetterCaseRepeatInsideOneRequestIsNamedAfterTheFirstCopy() throws Exception {
		String answer = importAs(UUID.randomUUID(), """
				{"students":[
				 {"row":2,"firstName":"Zeina","lastName":"Fakhoury","grade":"3","guardianName":"G","guardianPhone":"+961 3 222 111"},
				 {"row":3,"firstName":"ZEINA","lastName":"fakhoury","grade":"3","guardianName":"G","guardianPhone":"+961 3 222 111"}]}
				""");

		assertEquals("Same student and guardian phone as row 2.",
				(String) JsonPath.read(answer, "$.results[1].errors.guardianPhone"));
		assertEquals(1, (int) JsonPath.read(answer, "$.created"));
	}

	@Test
	void aMalformedRequestIsA400WithTheSampleBodyAndCreatesNobody() throws Exception {
		UUID school = UUID.randomUUID();
		String tooMany = IntStream.rangeClosed(1, 501).mapToObj(i -> "{\"row\":" + i
				+ ",\"firstName\":\"A\",\"lastName\":\"B\",\"grade\":\"3\",\"guardianName\":\"G\",\"guardianPhone\":\"+961 3 123 456\"}")
				.collect(Collectors.joining(",", "{\"students\":[", "]}"));
		String[][] cases = {
				{ tooMany, "response-400.json" },
				{ "{\"students\":[{\"firstName\":\"A\"}]}", "response-400-row.json" },
				{ "{\"students\":[{\"row\":2},{\"row\":3},{\"row\":3},{\"row\":4}]}", "response-400-repeat.json" },
		};
		for (String[] one : cases) {
			String body = mockMvc.perform(post(IMPORT).with(headOf(school)).contentType(MediaType.APPLICATION_JSON)
							.content(one[0]))
					.andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
			Object expected = JsonPath.read(sample(one[1]), "$.errors");
			Object actual = JsonPath.read(body, "$.errors");
			assertEquals(expected, actual, one[1]);
			assertEquals("Validation failed", (String) JsonPath.read(body, "$.detail"));
		}
		mockMvc.perform(post(IMPORT).with(headOf(school)).contentType(MediaType.APPLICATION_JSON).content("{\"students\":[]}"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.students").exists());
		assertEquals(0, studentRepository.findBySchoolIdOrderByCreatedAtAsc(school).size());
	}

	@Test
	void aBodyThatIsNotAListOfRowsIsMalformed() throws Exception {
		for (String body : List.of("not json", "{\"students\":{}}", "{\"students\":\"x\"}")) {
			mockMvc.perform(post(IMPORT).with(headOf(UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
							.content(body))
					.andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Malformed request body"));
		}
	}

	@Test
	void aRowThatSendsAnAddressNeverGetsOneAndNothingIsGeocoded() throws Exception {
		UUID school = UUID.randomUUID();
		String answer = importAs(school, """
				{"students":[{"row":2,"firstName":"Nour","lastName":"Haddad","grade":"3","guardianName":"G",
				 "guardianPhone":"+961 3 123 456","address":"Hamra Street, Beirut"}]}
				""");

		assertEquals(1, (int) JsonPath.read(answer, "$.created"));
		assertNull(studentRepository.findBySchoolIdOrderByCreatedAtAsc(school).get(0).getAddress());
		verifyNoInteractions(geocoder);
	}

	@Test
	void singleCreateAnswersATooLongValueWithAFieldErrorNotA500() throws Exception {
		mockMvc.perform(post(URL).with(headOf(UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON).content("""
						{"firstName":"%s","lastName":"B","grade":"%s","guardianName":"G","guardianPhone":"+961 3 123 456"}
						""".formatted("a".repeat(101), "c".repeat(51))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.firstName").value("First name must be 100 characters or fewer"))
				.andExpect(jsonPath("$.errors.grade").value("Grade must be 50 characters or fewer"));
	}

	@Test
	void singleCreateAnswersABlankPhoneWithOnlyTheRequiredMessage() throws Exception {
		mockMvc.perform(post(URL).with(headOf(UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON).content("""
						{"firstName":"A","lastName":"B","grade":"3","guardianName":"G","guardianPhone":"   "}
						"""))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.guardianPhone").value("Guardian phone is required"));
	}
}
