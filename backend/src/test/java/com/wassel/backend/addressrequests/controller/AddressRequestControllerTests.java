package com.wassel.backend.addressrequests.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.geocoding.service.GeocodeResult;
import com.wassel.backend.geocoding.service.Geocoder;
import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.LinkParentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.dto.UpdateStudentLocationRequest;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-269: the parent's submit and list, the head of transportation's list, approve and reject, against
 * {@code docs/contracts/address-requests.md}. Every test uses its own school id, so fixtures never collide.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AddressRequestControllerTests {

	private static final String HOME = "Hamra Street, Beirut";

	private static final String NEW_ADDRESS = "Verdun Street 12, Beirut";

	private final UUID schoolId = UUID.randomUUID();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private StudentService studentService;

	@Autowired
	private StudentRepository studentRepository;

	@Autowired
	private UserService userService;

	// A real lookup is never made in this class (see NominatimGeocoderTests for that).
	@MockitoBean
	private Geocoder geocoder;

	// --- fixtures -----------------------------------------------------------------------------

	private User newParent(UUID school) {
		return userService.createUser("parent-" + UUID.randomUUID() + "@wassel.test", "password123", Role.PARENT,
				school);
	}

	private StudentResponse newChildOf(User parent) {
		when(geocoder.geocode(anyString())).thenReturn(Optional.of(new GeocodeResult(new BigDecimal("33.890000"),
				new BigDecimal("35.500000"))));
		StudentResponse student = studentService.addStudent(parent.getSchoolId(), new CreateStudentRequest("Tarek",
				"Mansour", "Grade 3", "Rana Mansour", "+961 3 " + (100000 + Math.abs(UUID.randomUUID().hashCode() % 899999)),
				HOME));
		studentService.linkParent(parent.getSchoolId(), student.id(), new LinkParentRequest(parent.getId()));
		return student;
	}

	private RequestPostProcessor asParent(User parent) {
		User principal = User.builder().id(parent.getId()).email(parent.getEmail()).passwordHash("x")
				.role(Role.PARENT).schoolId(parent.getSchoolId()).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				principal, null, List.of(new SimpleGrantedAuthority("ROLE_PARENT"))));
	}

	private RequestPostProcessor asHead(UUID school) {
		User principal = User.builder().id(UUID.randomUUID()).email("hot@wassel.test").passwordHash("x")
				.role(Role.HEAD_OF_TRANSPORT).schoolId(school).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				principal, null, List.of(new SimpleGrantedAuthority("ROLE_HEAD_OF_TRANSPORT"))));
	}

	private static String childUrl(UUID studentId) {
		return "/api/parent/children/" + studentId + "/address-requests";
	}

	private static String body(String address) {
		return "{\"address\":\"%s\"}".formatted(address);
	}

	private static String bodyWithPin(String address, String lat, String lng) {
		return "{\"address\":\"%s\",\"latitude\":%s,\"longitude\":%s}".formatted(address, lat, lng);
	}

	private MockHttpServletResponse submit(User parent, UUID studentId, String json) throws Exception {
		return mockMvc.perform(post(childUrl(studentId)).with(asParent(parent)).contentType(MediaType.APPLICATION_JSON)
				.content(json)).andReturn().getResponse();
	}

	/** Sends a valid request and returns its id. */
	private String submitOk(User parent, StudentResponse child, String json) throws Exception {
		MockHttpServletResponse response = submit(parent, child.id(), json);
		assertEquals(201, response.getStatus(), response.getContentAsString());
		return JsonPath.read(response.getContentAsString(), "$.id");
	}

	private MockHttpServletResponse approve(UUID school, String id) throws Exception {
		return mockMvc.perform(post("/api/head-of-transport/address-requests/" + id + "/approve").with(asHead(school)))
				.andReturn().getResponse();
	}

	private MockHttpServletResponse reject(UUID school, String id, String json) throws Exception {
		var request = post("/api/head-of-transport/address-requests/" + id + "/reject").with(asHead(school));
		if (json != null) {
			request = request.contentType(MediaType.APPLICATION_JSON).content(json);
		}
		return mockMvc.perform(request).andReturn().getResponse();
	}

	private StudentResponse reload(StudentResponse child) {
		return studentService.getStudent(schoolId, child.id());
	}

	// --- submitting ---------------------------------------------------------------------------

	@Test
	void parentSubmitsAPendingRequestWithTheSnapshotOfTheChildAndTheirself() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);

		mockMvc.perform(post(childUrl(child.id())).with(asParent(parent)).contentType(MediaType.APPLICATION_JSON)
						.content(body("  " + NEW_ADDRESS + "  ")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.studentId").value(child.id().toString()))
				.andExpect(jsonPath("$.studentName").value("Tarek Mansour"))
				.andExpect(jsonPath("$.currentAddress").value(HOME))
				.andExpect(jsonPath("$.requestedAddress").value(NEW_ADDRESS))
				.andExpect(jsonPath("$.requestedLat").value((Object) null))
				.andExpect(jsonPath("$.requestedLng").value((Object) null))
				.andExpect(jsonPath("$.requestedBy.parentUserId").value(parent.getId().toString()))
				.andExpect(jsonPath("$.requestedBy.email").value(parent.getEmail()))
				.andExpect(jsonPath("$.status").value("pending"))
				.andExpect(jsonPath("$.createdAt").isNotEmpty())
				.andExpect(jsonPath("$.decidedAt").value((Object) null))
				.andExpect(jsonPath("$.rejectionReason").value((Object) null));

		assertEquals(HOME, reload(child).address(), "a pending request leaves the saved address alone");
	}

	@Test
	void parentCanSendAPinWithTheRequest() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);

		mockMvc.perform(post(childUrl(child.id())).with(asParent(parent)).contentType(MediaType.APPLICATION_JSON)
						.content(bodyWithPin(NEW_ADDRESS, "33.8707", "35.4842")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.requestedLat").value(33.8707))
				.andExpect(jsonPath("$.requestedLng").value(35.4842));
	}

	@Test
	void anotherParentsChildIsNotFound() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		User stranger = newParent(schoolId);

		assertEquals(404, submit(stranger, child.id(), body(NEW_ADDRESS)).getStatus());
		mockMvc.perform(get(childUrl(child.id())).with(asParent(stranger))).andExpect(status().isNotFound());
	}

	@Test
	void aChildOfAnotherSchoolAndAnUnknownChildAreNotFound() throws Exception {
		UUID otherSchool = UUID.randomUUID();
		User otherParent = newParent(otherSchool);
		StudentResponse otherChild = newChildOf(otherParent);
		User parent = newParent(schoolId);

		assertEquals(404, submit(parent, otherChild.id(), body(NEW_ADDRESS)).getStatus());
		assertEquals(404, submit(parent, UUID.randomUUID(), body(NEW_ADDRESS)).getStatus());
	}

	@Test
	void aSecondPendingRequestForTheSameChildIsRefusedWhoeverSendsIt() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		submitOk(parent, child, body(NEW_ADDRESS));

		MockHttpServletResponse second = submit(parent, child.id(), body("Another street, Beirut"));

		assertEquals(409, second.getStatus());
		assertTrue(second.getContentAsString().contains("already has a pending"));
	}

	@Test
	void aNewRequestCanBeSentOnceTheFirstIsDecided() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String first = submitOk(parent, child, body(NEW_ADDRESS));
		assertEquals(200, reject(schoolId, first, null).getStatus());

		submitOk(parent, child, body("Another street, Beirut"));
	}

	@Test
	void twoRequestsAtTheSameTimeLeaveOnePendingRequest() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);

		List<Integer> statuses = inParallel(
				() -> submit(parent, child.id(), body("First street, Beirut")).getStatus(),
				() -> submit(parent, child.id(), body("Second street, Beirut")).getStatus());

		assertEquals(List.of(201, 409), statuses.stream().sorted().toList());
	}

	@Test
	void invalidBodiesAreRefusedOnTheirField() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);

		for (String[] bad : new String[][] {
				{ body(""), "address" },
				{ body("   "), "address" },
				{ "{}", "address" },
				{ body("x".repeat(256)), "address" },
				{ "{\"address\":\"" + NEW_ADDRESS + "\",\"latitude\":33.9}", "longitude" },
				{ "{\"address\":\"" + NEW_ADDRESS + "\",\"longitude\":35.5}", "latitude" },
				{ bodyWithPin(NEW_ADDRESS, "91", "35.5"), "latitude" },
				{ bodyWithPin(NEW_ADDRESS, "33.9", "-181"), "longitude" } }) {
			MockHttpServletResponse response = submit(parent, child.id(), bad[0]);
			assertEquals(400, response.getStatus(), bad[0]);
			assertTrue(response.getContentAsString().contains("\"" + bad[1] + "\""), bad[0]);
		}
		mockMvc.perform(post(childUrl(child.id())).with(asParent(parent)).contentType(MediaType.APPLICATION_JSON)
				.content("not json")).andExpect(status().isBadRequest());
	}

	@Test
	void askingForTheSavedAddressAgainIsRefusedButANewPinForItIsNot() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);

		MockHttpServletResponse same = submit(parent, child.id(), body("  hamra street, beirut "));
		assertEquals(400, same.getStatus());
		assertTrue(same.getContentAsString().contains("\"address\""));

		submitOk(parent, child, bodyWithPin(HOME, "33.8707", "35.4842"));
	}

	@Test
	void anInactiveChildCannotHaveARequest() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		makeInactive(child);

		MockHttpServletResponse response = submit(parent, child.id(), body(NEW_ADDRESS));

		assertEquals(409, response.getStatus());
		assertTrue(response.getContentAsString().contains("\"studentId\""));
	}

	// --- listing ------------------------------------------------------------------------------

	@Test
	void parentSeesOnlyTheirOwnRequestsNewestFirst() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String first = submitOk(parent, child, body("First street, Beirut"));
		assertEquals(200, reject(schoolId, first, null).getStatus());
		String second = submitOk(parent, child, body("Second street, Beirut"));

		mockMvc.perform(get(childUrl(child.id())).with(asParent(parent)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].id").value(second))
				.andExpect(jsonPath("$[0].status").value("pending"))
				.andExpect(jsonPath("$[1].id").value(first))
				.andExpect(jsonPath("$[1].status").value("rejected"));
	}

	@Test
	void aParentLinkedLaterDoesNotSeeTheEarlierParentsRequests() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		submitOk(parent, child, body(NEW_ADDRESS));
		User next = newParent(schoolId);
		studentService.linkParent(schoolId, child.id(), new LinkParentRequest(next.getId()));

		mockMvc.perform(get(childUrl(child.id())).with(asParent(next)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void headListsPendingRequestsOldestFirstByDefaultAndFiltersByStatus() throws Exception {
		User firstParent = newParent(schoolId);
		StudentResponse firstChild = newChildOf(firstParent);
		User secondParent = newParent(schoolId);
		StudentResponse secondChild = newChildOf(secondParent);
		String older = submitOk(firstParent, firstChild, body("First street, Beirut"));
		String newer = submitOk(secondParent, secondChild, body("Second street, Beirut"));
		assertEquals(200, reject(schoolId, older, "{\"reason\":\"No\"}").getStatus());
		String evenNewer = submitOk(firstParent, firstChild, body("Third street, Beirut"));

		mockMvc.perform(get("/api/head-of-transport/address-requests").with(asHead(schoolId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].id").value(newer))
				.andExpect(jsonPath("$[1].id").value(evenNewer));
		mockMvc.perform(get("/api/head-of-transport/address-requests?status=rejected").with(asHead(schoolId)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].id").value(older));
		mockMvc.perform(get("/api/head-of-transport/address-requests?status=approved").with(asHead(schoolId)))
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void headCannotSeeAnotherSchoolsRequestsAndAnUnknownStatusIsRefused() throws Exception {
		User parent = newParent(schoolId);
		submitOk(parent, newChildOf(parent), body(NEW_ADDRESS));

		mockMvc.perform(get("/api/head-of-transport/address-requests").with(asHead(UUID.randomUUID())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
		mockMvc.perform(get("/api/head-of-transport/address-requests?status=all").with(asHead(schoolId)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.status").isNotEmpty());
	}

	// --- approving ----------------------------------------------------------------------------

	@Test
	void approvingSavesTheAddressAndGeocodesIt() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String id = submitOk(parent, child, body(NEW_ADDRESS));
		when(geocoder.geocode(NEW_ADDRESS)).thenReturn(Optional.of(new GeocodeResult(new BigDecimal("33.871000"),
				new BigDecimal("35.484000"))));

		MockHttpServletResponse response = approve(schoolId, id);

		assertEquals(200, response.getStatus(), response.getContentAsString());
		assertEquals("approved", JsonPath.read(response.getContentAsString(), "$.status"));
		assertTrue(JsonPath.read(response.getContentAsString(), "$.decidedAt") != null);
		StudentResponse saved = reload(child);
		assertEquals(NEW_ADDRESS, saved.address());
		assertEquals(0, new BigDecimal("33.871000").compareTo(saved.latitude()));
		assertEquals(0, new BigDecimal("35.484000").compareTo(saved.longitude()));
	}

	@Test
	void approvingARequestWithAPinSavesThePinAsAManualPin() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String id = submitOk(parent, child, bodyWithPin(NEW_ADDRESS, "33.8707", "35.4842"));

		assertEquals(200, approve(schoolId, id).getStatus());

		StudentResponse saved = reload(child);
		assertEquals(NEW_ADDRESS, saved.address());
		assertEquals(0, new BigDecimal("33.870700").compareTo(saved.latitude()));
		assertEquals(0, new BigDecimal("35.484200").compareTo(saved.longitude()));
		assertTrue(studentRepository.findById(child.id()).orElseThrow().isManualPin());
	}

	@Test
	void approvingKeepsAnExistingManualPinWhenTheRequestHasNone() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		studentService.updateLocation(schoolId, child.id(),
				new UpdateStudentLocationRequest(new BigDecimal("33.900000"), new BigDecimal("35.600000")));
		String id = submitOk(parent, child, body(NEW_ADDRESS));

		assertEquals(200, approve(schoolId, id).getStatus());

		StudentResponse saved = reload(child);
		assertEquals(NEW_ADDRESS, saved.address());
		assertEquals(0, new BigDecimal("33.900000").compareTo(saved.latitude()));
	}

	@Test
	void approvingAnAlreadyDecidedRequestIsRefusedAndChangesNothing() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String id = submitOk(parent, child, body(NEW_ADDRESS));
		assertEquals(200, approve(schoolId, id).getStatus());

		MockHttpServletResponse again = approve(schoolId, id);
		MockHttpServletResponse rejected = reject(schoolId, id, null);

		assertEquals(409, again.getStatus());
		assertTrue(again.getContentAsString().contains("already approved"));
		assertEquals(409, rejected.getStatus());
		assertEquals(NEW_ADDRESS, reload(child).address());
	}

	@Test
	void approvingForAnInactiveChildIsRefusedAndTheRequestStaysPending() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String id = submitOk(parent, child, body(NEW_ADDRESS));
		makeInactive(child);

		MockHttpServletResponse response = approve(schoolId, id);

		assertEquals(409, response.getStatus());
		assertEquals(HOME, reload(child).address());
		mockMvc.perform(get("/api/head-of-transport/address-requests").with(asHead(schoolId)))
				.andExpect(jsonPath("$[0].status").value("pending"));
		assertEquals(200, reject(schoolId, id, null).getStatus(), "an inactive child's request can still be rejected");
	}

	@Test
	void aRequestOfAnotherSchoolAndAnUnknownRequestAreNotFound() throws Exception {
		User parent = newParent(schoolId);
		String id = submitOk(parent, newChildOf(parent), body(NEW_ADDRESS));
		UUID otherSchool = UUID.randomUUID();

		assertEquals(404, approve(otherSchool, id).getStatus());
		assertEquals(404, reject(otherSchool, id, null).getStatus());
		assertEquals(404, approve(schoolId, UUID.randomUUID().toString()).getStatus());
		assertEquals(400, approve(schoolId, "not-a-uuid").getStatus());
	}

	@Test
	void twoApprovalsAtTheSameTimeLeaveOneWinner() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String id = submitOk(parent, child, body(NEW_ADDRESS));

		List<Integer> statuses = inParallel(() -> approve(schoolId, id).getStatus(),
				() -> approve(schoolId, id).getStatus());

		assertEquals(List.of(200, 409), statuses.stream().sorted().toList());
	}

	@Test
	void anApprovalAndARejectionAtTheSameTimeLeaveOneWinner() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String id = submitOk(parent, child, body(NEW_ADDRESS));

		List<Integer> statuses = inParallel(() -> approve(schoolId, id).getStatus(),
				() -> reject(schoolId, id, null).getStatus());

		assertEquals(List.of(200, 409), statuses.stream().sorted().toList());
	}

	// --- rejecting ----------------------------------------------------------------------------

	@Test
	void rejectingKeepsTheSavedAddressAndStoresTheReason() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String id = submitOk(parent, child, bodyWithPin(NEW_ADDRESS, "33.8707", "35.4842"));

		MockHttpServletResponse response = reject(schoolId, id, "{\"reason\":\"  Outside the area  \"}");

		assertEquals(200, response.getStatus(), response.getContentAsString());
		assertEquals("rejected", JsonPath.read(response.getContentAsString(), "$.status"));
		assertEquals("Outside the area", JsonPath.read(response.getContentAsString(), "$.rejectionReason"));
		assertTrue(JsonPath.read(response.getContentAsString(), "$.decidedAt") != null);
		StudentResponse saved = reload(child);
		assertEquals(HOME, saved.address());
		assertEquals(0, new BigDecimal("33.890000").compareTo(saved.latitude()));
	}

	@Test
	void rejectingWithNoBodyOrABlankReasonStoresNoReason() throws Exception {
		User parent = newParent(schoolId);
		StudentResponse child = newChildOf(parent);
		String first = submitOk(parent, child, body(NEW_ADDRESS));

		MockHttpServletResponse noBody = reject(schoolId, first, null);
		assertEquals(200, noBody.getStatus(), noBody.getContentAsString());
		assertNull(JsonPath.read(noBody.getContentAsString(), "$.rejectionReason"));

		String second = submitOk(parent, child, body("Another street, Beirut"));
		MockHttpServletResponse blank = reject(schoolId, second, "{\"reason\":\"   \"}");
		assertEquals(200, blank.getStatus());
		assertNull(JsonPath.read(blank.getContentAsString(), "$.rejectionReason"));
	}

	@Test
	void aTooLongReasonIsRefusedAndTheRequestStaysPending() throws Exception {
		User parent = newParent(schoolId);
		String id = submitOk(parent, newChildOf(parent), body(NEW_ADDRESS));

		MockHttpServletResponse response = reject(schoolId, id, "{\"reason\":\"" + "x".repeat(256) + "\"}");

		assertEquals(400, response.getStatus());
		assertTrue(response.getContentAsString().contains("\"reason\""));
		mockMvc.perform(get("/api/head-of-transport/address-requests").with(asHead(schoolId)))
				.andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void rejectingTwiceIsRefused() throws Exception {
		User parent = newParent(schoolId);
		String id = submitOk(parent, newChildOf(parent), body(NEW_ADDRESS));
		assertEquals(200, reject(schoolId, id, null).getStatus());

		MockHttpServletResponse again = reject(schoolId, id, "{\"reason\":\"Again\"}");

		assertEquals(409, again.getStatus());
		assertTrue(again.getContentAsString().contains("already rejected"));
	}

	// --- helpers ------------------------------------------------------------------------------

	private void makeInactive(StudentResponse child) {
		Student student = studentRepository.findById(child.id()).orElseThrow();
		student.setStatus(StudentStatus.INACTIVE);
		studentRepository.save(student);
	}

	/** Runs the calls at the same moment on separate threads and returns what each returned. */
	@SafeVarargs
	private static <T> List<T> inParallel(Callable<T>... calls) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(calls.length);
		try {
			CountDownLatch ready = new CountDownLatch(calls.length);
			CountDownLatch go = new CountDownLatch(1);
			List<Future<T>> futures = java.util.Arrays.stream(calls).map(call -> pool.submit(() -> {
				ready.countDown();
				go.await();
				return call.call();
			})).toList();
			assertTrue(ready.await(10, TimeUnit.SECONDS));
			go.countDown();
			java.util.ArrayList<T> results = new java.util.ArrayList<>();
			for (Future<T> future : futures) {
				results.add(future.get(30, TimeUnit.SECONDS));
			}
			return results;
		} finally {
			pool.shutdownNow();
		}
	}
}
