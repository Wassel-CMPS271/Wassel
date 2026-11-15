package com.wassel.backend.addressrequests.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.CriteriaTestSupport;
import com.wassel.backend.common.MondayClockConfig;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SCRUM-266: independent tests of the pickup-address request API (SCRUM-269), written from
 * {@code docs/contracts/address-requests.md}, its samples and the ticket, never from {@code AddressRequestControllerTests}
 * or the address-request code. Stories behind it: SCRUM-39 and SCRUM-80.
 *
 * <p>Every student here has a <b>manual pin</b> (saved straight to the database, like the school's other test rows), so an
 * approval never asks the real geocoding provider (Nominatim, a public service) for anything. What the geocoder does on
 * an approval is in {@link AddressRequestGeocodingCriteriaTests}, with the provider replaced by a double. Each test uses its
 * own random school, so nothing sees another test's rows; nothing is deleted.
 */
class AddressRequestCriteriaTests extends CriteriaTestSupport {

	private static final String SAVED_ADDRESS = "Hamra Street, Beirut";

	private static final BigDecimal SAVED_LAT = new BigDecimal("33.893800");

	private static final BigDecimal SAVED_LNG = new BigDecimal("35.501800");

	private static final String NEW_ADDRESS = "Verdun Street 12, Beirut";

	private static final Set<String> KEYS = Set.of("id", "studentId", "studentName", "currentAddress", "requestedAddress",
			"requestedLat", "requestedLng", "requestedBy", "status", "createdAt", "decidedAt", "rejectionReason");

	private final UUID school = UUID.randomUUID();

	@Autowired
	private UserRepository userRepository;

	/** A parent with a real account (so the email in the request is a real one) and the session that goes with it. */
	private record Parent(User user, RequestPostProcessor session) {

		UUID id() {
			return user.getId();
		}
	}

	private Parent aParent() {
		return aParentOf(school);
	}

	private Parent aParentOf(UUID schoolId) {
		User user = userRepository.save(User.builder().email("parent-" + UUID.randomUUID() + "@wassel.test")
				.passwordHash("x").role(Role.PARENT).schoolId(schoolId).build());
		return new Parent(user, authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_PARENT")))));
	}

	private RequestPostProcessor head() {
		return headOf(school);
	}

	private RequestPostProcessor headOf(UUID schoolId) {
		return loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId, UUID.randomUUID());
	}

	/** An active student with a saved address and a manual pin, linked to {@code parent}. */
	private Student aChild(UUID schoolId, UUID parent, String name) {
		return studentRepository.save(Student.builder().schoolId(schoolId).firstName(name).lastName("Mansour").grade("3")
				.guardianName("Guardian " + name).guardianPhone("+961 3 100 100").status(StudentStatus.ACTIVE)
				.address(SAVED_ADDRESS).latitude(SAVED_LAT).longitude(SAVED_LNG).manualPin(true).parentUserId(parent)
				.build());
	}

	private Student aChildOf(Parent parent, String name) {
		return aChild(school, parent.id(), name);
	}

	private static String body(String address, String lat, String lng) {
		StringBuilder json = new StringBuilder("{\"address\":\"").append(address).append('"');
		if (lat != null) {
			json.append(",\"latitude\":").append(lat);
		}
		if (lng != null) {
			json.append(",\"longitude\":").append(lng);
		}
		return json.append('}').toString();
	}

	/** The head of transportation links the child to another parent. */
	private MockHttpServletResponse relink(Student child, Parent newParent) throws Exception {
		return send(patch("/api/head-of-transport/students/" + child.getId() + "/parent").with(head())
				.contentType(MediaType.APPLICATION_JSON).content("{\"parentUserId\":\"%s\"}".formatted(newParent.id())));
	}

	private static List<Integer> sorted(List<Integer> statuses) {
		List<Integer> sorted = new ArrayList<>(statuses);
		Collections.sort(sorted);
		return sorted;
	}

	private MockHttpServletResponse send(MockHttpServletRequestBuilder request) throws Exception {
		return mockMvc.perform(request).andReturn().getResponse();
	}

	private MockHttpServletResponse submit(Parent parent, UUID child, String json) throws Exception {
		return send(post("/api/parent/children/" + child + "/address-requests").with(parent.session())
				.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	/** Submits a request with a pin and returns its id; the test fails if the answer is not 201. */
	private String submitted(Parent parent, UUID child) throws Exception {
		MockHttpServletResponse response = submit(parent, child, body(NEW_ADDRESS, "33.8707", "35.4842"));
		assertEquals(201, response.getStatus(), response.getContentAsString());
		return JsonPath.read(response.getContentAsString(), "$.id");
	}

	private MockHttpServletResponse approve(String request) throws Exception {
		return approveAs(head(), request);
	}

	private MockHttpServletResponse approveAs(RequestPostProcessor who, String request) throws Exception {
		return send(post("/api/head-of-transport/address-requests/" + request + "/approve").with(who));
	}

	private MockHttpServletResponse reject(String request, String json) throws Exception {
		return rejectAs(head(), request, json);
	}

	private MockHttpServletResponse rejectAs(RequestPostProcessor who, String request, String json) throws Exception {
		return send(post("/api/head-of-transport/address-requests/" + request + "/reject").with(who)
				.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private MockHttpServletResponse headList(String status) throws Exception {
		return headListAs(head(), status);
	}

	private MockHttpServletResponse headListAs(RequestPostProcessor who, String status) throws Exception {
		MockHttpServletRequestBuilder request = get("/api/head-of-transport/address-requests").with(who);
		if (status != null) {
			request.param("status", status);
		}
		return send(request);
	}

	private List<String> headIds(String status) throws Exception {
		MockHttpServletResponse response = headList(status);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return JsonPath.read(response.getContentAsString(), "$[*].id");
	}

	private Map<String, Object> requestInList(String status, String id) throws Exception {
		List<Map<String, Object>> found = JsonPath.read(headList(status).getContentAsString(), "$[?(@.id == '" + id + "')]");
		assertEquals(1, found.size(), "request " + id + " in the " + status + " list");
		return found.get(0);
	}

	private MockHttpServletResponse parentList(Parent parent, UUID child) throws Exception {
		return send(get("/api/parent/children/" + child + "/address-requests").with(parent.session()));
	}

	/** The student as the head of transportation's list shows them: address and pin. */
	private Map<String, Object> studentShown(UUID id) throws Exception {
		MockHttpServletResponse response = send(get("/api/head-of-transport/students").with(head()));
		assertEquals(200, response.getStatus());
		List<Map<String, Object>> found = JsonPath.read(response.getContentAsString(), "$[?(@.id == '" + id + "')]");
		assertEquals(1, found.size());
		return found.get(0);
	}

	private void assertStudentUnchanged(UUID id) throws Exception {
		assertStudentIs(id, SAVED_ADDRESS, SAVED_LAT.doubleValue(), SAVED_LNG.doubleValue());
	}

	private void assertStudentIs(UUID id, String address, double lat, double lng) throws Exception {
		Map<String, Object> student = studentShown(id);
		assertEquals(address, student.get("address"));
		assertEquals(lat, ((Number) student.get("latitude")).doubleValue(), 0.000001);
		assertEquals(lng, ((Number) student.get("longitude")).doubleValue(), 0.000001);
	}

	// ---------------------------------------------------------------- submitting

	/** Contract "AddressRequest" and samples/address-requests/address-request-pending.json. */
	@Test
	void aSubmittedRequestIsPendingWithExactlyTheContractsKeysAndValues() throws Exception {
		Parent parent = aParent();
		Student child = aChildOf(parent, "Tarek");

		MockHttpServletResponse response = submit(parent, child.getId(), body("  " + NEW_ADDRESS + "  ", "33.8707", "35.4842"));

		assertEquals(201, response.getStatus(), response.getContentAsString());
		String json = response.getContentAsString();
		Map<String, Object> shown = JsonPath.read(json, "$");
		assertEquals(KEYS, shown.keySet());
		assertEquals("pending", shown.get("status"));
		assertEquals(child.getId().toString(), shown.get("studentId"));
		assertEquals("Tarek Mansour", shown.get("studentName"));
		assertEquals(SAVED_ADDRESS, shown.get("currentAddress"));
		assertEquals(NEW_ADDRESS, shown.get("requestedAddress"), "trimmed");
		assertEquals(33.8707, ((Number) shown.get("requestedLat")).doubleValue(), 0.000001);
		assertEquals(35.4842, ((Number) shown.get("requestedLng")).doubleValue(), 0.000001);
		assertEquals(Set.of("parentUserId", "email"), JsonPath.<Map<String, Object>>read(json, "$.requestedBy").keySet());
		assertEquals(parent.id().toString(), JsonPath.read(json, "$.requestedBy.parentUserId"));
		assertEquals(parent.user().getEmail(), JsonPath.read(json, "$.requestedBy.email"));
		assertNull(shown.get("decidedAt"));
		assertNull(shown.get("rejectionReason"));
		assertEquals(MondayClockConfig.MONDAY, Instant.parse((String) shown.get("createdAt")));
		assertEquals(UUID.fromString((String) shown.get("id")).toString(), shown.get("id"));
	}

	/**
	 * Contract: "currentAddress ... never re-read", "studentName ... when the request was made", "email as it was then". After
	 * the head edits the student's address through their own endpoint, and the student's name and the parent's email change
	 * in the database, both lists still show the values from the moment of the request, and so does the approved request.
	 */
	@Test
	void theCurrentAddressTheNameAndTheEmailAreWhatTheyWereWhenTheRequestWasMadeNeverReRead() throws Exception {
		Parent parent = aParent();
		Student child = aChildOf(parent, "Tarek");
		String originalEmail = parent.user().getEmail();
		String id = submitted(parent, child.getId());

		MockHttpServletResponse edit = send(patch("/api/head-of-transport/students/" + child.getId() + "/address").with(head())
				.contentType(MediaType.APPLICATION_JSON).content("{\"address\":\"Changed Street 9, Beirut\"}"));
		assertEquals(200, edit.getStatus(), edit.getContentAsString());
		assertStudentIs(child.getId(), "Changed Street 9, Beirut", SAVED_LAT.doubleValue(), SAVED_LNG.doubleValue());
		Student renamed = studentRepository.findById(child.getId()).orElseThrow();
		renamed.setFirstName("Tareq");
		studentRepository.save(renamed);
		User moved = userRepository.findById(parent.id()).orElseThrow();
		moved.setEmail("moved-" + UUID.randomUUID() + "@wassel.test");
		userRepository.save(moved);

		Map<String, Object> inHeadList = requestInList("pending", id);
		List<Map<String, Object>> inParentList = JsonPath.read(parentList(parent, child.getId()).getContentAsString(), "$");
		MockHttpServletResponse approved = approve(id);

		assertEquals(1, inParentList.size());
		for (Map<String, Object> shown : List.of(inHeadList, inParentList.get(0))) {
			assertEquals(SAVED_ADDRESS, shown.get("currentAddress"));
			assertEquals("Tarek Mansour", shown.get("studentName"));
			assertEquals(originalEmail, JsonPath.read(shown, "$.requestedBy.email"));
		}
		assertEquals(200, approved.getStatus(), approved.getContentAsString());
		assertEquals(SAVED_ADDRESS, JsonPath.read(approved.getContentAsString(), "$.currentAddress"));
		assertEquals("Tarek Mansour", JsonPath.read(approved.getContentAsString(), "$.studentName"));
		assertEquals(originalEmail, JsonPath.read(approved.getContentAsString(), "$.requestedBy.email"));
	}

	/** Contract: both pin fields are always present, both null when the parent placed no pin. */
	@Test
	void aRequestWithNoPinHasBothPinFieldsPresentAndNull() throws Exception {
		Parent parent = aParent();
		Student child = aChildOf(parent, "Tarek");

		MockHttpServletResponse response = submit(parent, child.getId(), body(NEW_ADDRESS, null, null));

		assertEquals(201, response.getStatus(), response.getContentAsString());
		Map<String, Object> shown = JsonPath.read(response.getContentAsString(), "$");
		assertEquals(KEYS, shown.keySet());
		assertNull(shown.get("requestedLat"));
		assertNull(shown.get("requestedLng"));
	}

	/** Contract: "at most 255 characters" and the pin bounds -90..90 and -180..180, the boundaries themselves are fine. */
	@Test
	void theLimitsOfTheFieldsAreAllowed() throws Exception {
		Parent parent = aParent();
		List<String> allowed = List.of(body("A".repeat(255), null, null), body(NEW_ADDRESS, "90", "180"),
				body(NEW_ADDRESS, "-90", "-180"), body(NEW_ADDRESS, "0", "0"));
		for (String json : allowed) {
			Student child = aChildOf(parent, "Tarek");
			MockHttpServletResponse response = submit(parent, child.getId(), json);
			assertEquals(201, response.getStatus(), json + " -> " + response.getContentAsString());
			assertEquals(JsonPath.<String>read(json, "$.address"), JsonPath.<String>read(response.getContentAsString(), "$.requestedAddress"));
		}
	}

	/** Contract Errors: an invalid address or pin is 400 with errors {field: message}. */
	@Test
	void anInvalidAddressOrPinIs400NamingTheField() throws Exception {
		Parent parent = aParent();
		Map<String, String> badBodies = new LinkedHashMap<>();
		badBodies.put(body("   ", null, null), "address");
		badBodies.put("{}", "address");
		badBodies.put("{\"address\":null}", "address");
		badBodies.put(body("A".repeat(256), null, null), "address");
		badBodies.put(body(NEW_ADDRESS, "90.0001", "35.4"), "latitude");
		badBodies.put(body(NEW_ADDRESS, "-90.0001", "35.4"), "latitude");
		badBodies.put(body(NEW_ADDRESS, "33.9", "180.0001"), "longitude");
		badBodies.put(body(NEW_ADDRESS, "33.9", "-180.0001"), "longitude");
		for (Map.Entry<String, String> bad : badBodies.entrySet()) {
			Student child = aChildOf(parent, "Tarek");
			MockHttpServletResponse response = submit(parent, child.getId(), bad.getKey());
			assertEquals(400, response.getStatus(), bad.getKey());
			Map<String, Object> errors = JsonPath.read(response.getContentAsString(), "$.errors");
			assertTrue(errors.containsKey(bad.getValue()), bad.getKey() + " should name " + bad.getValue() + ": " + errors);
			assertEquals("[]", parentList(parent, child.getId()).getContentAsString(), "a refused request is not saved");
		}
	}

	/** Contract: both pin fields or neither. Which field the 400 names is not in the contract (a gap), only that it is 400. */
	@Test
	void halfAPinIs400() throws Exception {
		Parent parent = aParent();
		for (String json : List.of(body(NEW_ADDRESS, "33.9", null), body(NEW_ADDRESS, null, "35.5"))) {
			Student child = aChildOf(parent, "Tarek");
			MockHttpServletResponse response = submit(parent, child.getId(), json);
			assertEquals(400, response.getStatus(), json);
			assertFalse(JsonPath.<Map<String, Object>>read(response.getContentAsString(), "$.errors").isEmpty());
			assertEquals("[]", parentList(parent, child.getId()).getContentAsString());
		}
	}

	/** Contract: the saved address again (case and surrounding spaces ignored) with no pin is 400 on "address"; with a pin it is allowed. */
	@Test
	void theSavedAddressAgainIs400UnlessTheParentPlacesAPin() throws Exception {
		Parent parent = aParent();
		Student child = aChildOf(parent, "Tarek");

		MockHttpServletResponse same = submit(parent, child.getId(), body("  hamra STREET, beirut ", null, null));
		MockHttpServletResponse withPin = submit(parent, child.getId(), body(SAVED_ADDRESS, "33.9", "35.5"));

		assertEquals(400, same.getStatus());
		assertTrue(JsonPath.<Map<String, Object>>read(same.getContentAsString(), "$.errors").containsKey("address"));
		assertEquals(201, withPin.getStatus(), withPin.getContentAsString());
	}

	/** Contract Errors: a body that is not JSON is 400 "Malformed request body"; a path id that does not parse is 400 "Invalid request parameter". */
	@Test
	void aBodyThatIsNotJsonAndAnIdThatIsNotAUuidAreBoth400() throws Exception {
		Parent parent = aParent();
		Student child = aChildOf(parent, "Tarek");

		MockHttpServletResponse notJson = submit(parent, child.getId(), "this is not json");
		MockHttpServletResponse badId = send(post("/api/parent/children/not-a-uuid/address-requests").with(parent.session())
				.contentType(MediaType.APPLICATION_JSON).content(body(NEW_ADDRESS, null, null)));
		MockHttpServletResponse badIdOnGet = send(get("/api/parent/children/not-a-uuid/address-requests").with(parent.session()));

		assertEquals(400, notJson.getStatus());
		assertEquals("Malformed request body", JsonPath.read(notJson.getContentAsString(), "$.detail"));
		assertEquals(400, badId.getStatus());
		assertEquals("Invalid request parameter", JsonPath.read(badId.getContentAsString(), "$.detail"));
		assertEquals(400, badIdOnGet.getStatus());
		assertEquals("Invalid request parameter", JsonPath.read(badIdOnGet.getContentAsString(), "$.detail"));
	}

	// ---------------------------------------------------------------- ownership

	/** Contract: another parent's child, another school's child and an unknown id are one 404, for submit and for the list; nothing is created. */
	@Test
	void aChildThatIsNotTheParentsIsA404ForSubmitAndListAndNothingIsCreated() throws Exception {
		Parent parent = aParent();
		Parent stranger = aParent();
		UUID otherSchool = UUID.randomUUID();
		Student strangersChild = aChildOf(stranger, "Bilal");
		Student otherSchoolsChild = aChild(otherSchool, parent.id(), "Celine");
		UUID unknown = UUID.randomUUID();

		List<MockHttpServletResponse> answers = new ArrayList<>();
		for (UUID child : List.of(strangersChild.getId(), otherSchoolsChild.getId(), unknown)) {
			answers.add(submit(parent, child, body(NEW_ADDRESS, null, null)));
			answers.add(parentList(parent, child));
		}

		Set<String> details = new HashSet<>();
		for (MockHttpServletResponse answer : answers) {
			assertEquals(404, answer.getStatus(), answer.getContentAsString());
			details.add(JsonPath.read(answer.getContentAsString(), "$.detail"));
		}
		assertEquals(1, details.size(), "the same answer whichever of the three it is: " + details);
		assertEquals(List.of(), headIds(null), "nothing was created");
		assertEquals(List.of(), JsonPath.<List<String>>read(
				headListAs(headOf(otherSchool), null).getContentAsString(), "$[*].id"));
	}

	// ---------------------------------------------------------------- one pending request per child

	/** Contract: a second request while one is pending is 409, for any parent (the new parent after a re-link too). */
	@Test
	void aSecondPendingRequestIs409EvenForTheParentTheChildWasRelinkedTo() throws Exception {
		Parent parent = aParent();
		Parent newParent = aParent();
		Student child = aChildOf(parent, "Tarek");
		submitted(parent, child.getId());

		MockHttpServletResponse again = submit(parent, child.getId(), body("Another street", null, null));
		MockHttpServletResponse linked = relink(child, newParent);
		MockHttpServletResponse byNewParent = submit(newParent, child.getId(), body("Another street", null, null));

		assertEquals(409, again.getStatus());
		assertFalse(JsonPath.<String>read(again.getContentAsString(), "$.detail").isBlank());
		assertEquals(200, linked.getStatus(), linked.getContentAsString());
		assertEquals(409, byNewParent.getStatus(), "a pending request blocks any parent");
		assertEquals(1, headIds(null).size());
	}

	/** Contract: after it is decided, a new request can be sent. */
	@Test
	void afterAnApprovalOrARejectionANewRequestIsAccepted() throws Exception {
		Parent parent = aParent();
		Student approvedChild = aChildOf(parent, "Tarek");
		Student rejectedChild = aChildOf(parent, "Rana");
		String first = submitted(parent, approvedChild.getId());
		String second = submitted(parent, rejectedChild.getId());
		assertEquals(200, approve(first).getStatus());
		assertEquals(200, reject(second, "{}").getStatus());

		assertEquals(201, submit(parent, approvedChild.getId(), body("Third street", null, null)).getStatus());
		assertEquals(201, submit(parent, rejectedChild.getId(), body("Fourth street", null, null)).getStatus());
	}

	// ---------------------------------------------------------------- an inactive child

	/** Contract: an inactive child cannot have a request (409 on studentId); approving one is 409 and the request stays pending; rejecting is fine. */
	@Test
	void anInactiveChildCannotSubmitOrBeApprovedButTheRequestCanBeRejected() throws Exception {
		Parent parent = aParent();
		Student inactive = aChildOf(parent, "Dana");
		inactive.setStatus(StudentStatus.INACTIVE);
		studentRepository.save(inactive);
		Student leaving = aChildOf(parent, "Tarek");
		String request = submitted(parent, leaving.getId());
		leaving.setStatus(StudentStatus.INACTIVE);
		studentRepository.save(leaving);

		MockHttpServletResponse submitting = submit(parent, inactive.getId(), body(NEW_ADDRESS, null, null));
		MockHttpServletResponse approving = approve(request);

		assertEquals(409, submitting.getStatus());
		assertTrue(JsonPath.<Map<String, Object>>read(submitting.getContentAsString(), "$.errors").containsKey("studentId"));
		assertEquals(409, approving.getStatus(), approving.getContentAsString());
		assertEquals("pending", requestInList("pending", request).get("status"));
		assertStudentUnchanged(leaving.getId());
		MockHttpServletResponse rejecting = reject(request, "{}");
		assertEquals(200, rejecting.getStatus(), rejecting.getContentAsString());
		assertEquals("rejected", JsonPath.read(rejecting.getContentAsString(), "$.status"));
	}

	// ---------------------------------------------------------------- listing

	/** Contract: the parent sees only the requests they sent for that child, all statuses, newest first. */
	@Test
	void theParentsListHoldsOnlyTheirOwnRequestsNewestFirst() throws Exception {
		Parent parent = aParent();
		Parent newParent = aParent();
		Student child = aChildOf(parent, "Tarek");
		String first = submitted(parent, child.getId());
		assertEquals(200, reject(first, "{}").getStatus());
		clock.set(MondayClockConfig.MONDAY.plusSeconds(60));
		String second = submitted(parent, child.getId());

		List<String> ids = JsonPath.read(parentList(parent, child.getId()).getContentAsString(), "$[*].id");
		List<String> statuses = JsonPath.read(parentList(parent, child.getId()).getContentAsString(), "$[*].status");

		assertEquals(List.of(second, first), ids);
		assertEquals(List.of("pending", "rejected"), statuses);
		assertEquals(200, reject(second, "{}").getStatus());
		assertEquals(200, relink(child, newParent).getStatus());
		clock.set(MondayClockConfig.MONDAY.plusSeconds(120));
		String third = submitted(newParent, child.getId());
		assertEquals(List.of(third), JsonPath.<List<String>>read(parentList(newParent, child.getId()).getContentAsString(), "$[*].id"),
				"the new parent sees only what they sent");
		assertEquals(404, parentList(parent, child.getId()).getStatus(), "the old parent no longer has the child");
	}

	/** Contract: the head sees pending by default, oldest first; ?status= filters; an unknown status is 400 on "status"; only their school. */
	@Test
	void theHeadsListDefaultsToPendingOldestFirstAndFiltersByStatus() throws Exception {
		Parent parent = aParent();
		List<String> ids = new ArrayList<>();
		for (int i = 0; i < 4; i++) {
			clock.set(MondayClockConfig.MONDAY.plusSeconds(i * 60L));
			ids.add(submitted(parent, aChildOf(parent, "Child" + i).getId()));
		}
		assertEquals(200, approve(ids.get(0)).getStatus());
		assertEquals(200, reject(ids.get(1), "{}").getStatus());
		UUID otherSchool = UUID.randomUUID();
		Parent otherParent = aParentOf(otherSchool);
		String foreign = JsonPath.read(submit(otherParent, aChild(otherSchool, otherParent.id(), "Zed").getId(),
				body(NEW_ADDRESS, "33.8", "35.4")).getContentAsString(), "$.id");

		assertEquals(List.of(ids.get(2), ids.get(3)), headIds(null), "pending by default, oldest first");
		assertEquals(List.of(ids.get(2), ids.get(3)), headIds("pending"));
		assertEquals(List.of(ids.get(0)), headIds("approved"));
		assertEquals(List.of(ids.get(1)), headIds("rejected"));
		assertFalse(headIds("pending").contains(foreign), "another school's request is never in the list");
		MockHttpServletResponse unknown = headList("archived");
		assertEquals(400, unknown.getStatus());
		assertTrue(JsonPath.<Map<String, Object>>read(unknown.getContentAsString(), "$.errors").containsKey("status"));
	}

	// ---------------------------------------------------------------- deciding: the state machine

	/** Contract Deciding: approve and reject are one-way moves from pending; any decision on a decided request is 409 and changes nothing. */
	@Test
	void everyDecisionOnADecidedRequestIs409AndChangesNothing() throws Exception {
		List<String[]> pairs = List.of(new String[] {"approve", "approve"}, new String[] {"approve", "reject"},
				new String[] {"reject", "approve"}, new String[] {"reject", "reject"});
		for (String[] pair : pairs) {
			Parent parent = aParent();
			Student child = aChildOf(parent, "Tarek");
			String request = submitted(parent, child.getId());
			MockHttpServletResponse first = decide(pair[0], request);
			assertEquals(200, first.getStatus(), pair[0] + ": " + first.getContentAsString());
			String firstStatus = pair[0].equals("approve") ? "approved" : "rejected";
			Map<String, Object> decided = requestInList(firstStatus, request);
			clock.set(MondayClockConfig.MONDAY.plusSeconds(600));

			MockHttpServletResponse second = decide(pair[1], request);

			String what = pair[0] + " then " + pair[1];
			assertEquals(409, second.getStatus(), what + ": " + second.getContentAsString());
			String detail = JsonPath.read(second.getContentAsString(), "$.detail");
			assertTrue(detail.toLowerCase().contains(firstStatus), what + ": the detail names the status: " + detail);
			assertTrue(detail.contains("2026-11-02"), what + ": the detail names decidedAt: " + detail);
			assertEquals(decided, requestInList(firstStatus, request), what + ": the request is as it was");
			if (pair[0].equals("approve")) {
				assertStudentIs(child.getId(), NEW_ADDRESS, 33.8707, 35.4842);
			}
			else {
				assertStudentUnchanged(child.getId());
			}
			clock.set(MondayClockConfig.MONDAY);
		}
	}

	private MockHttpServletResponse decide(String what, String request) throws Exception {
		return what.equals("approve") ? approve(request) : reject(request, "{}");
	}

	// ---------------------------------------------------------------- deciding: what it does to the student

	/** Contract: the student's address and pin do not change while a request is pending or after it is rejected. */
	@Test
	void theStudentIsUnchangedWhilePendingAndAfterARejection() throws Exception {
		Parent parent = aParent();
		Student child = aChildOf(parent, "Tarek");
		String request = submitted(parent, child.getId());

		assertStudentUnchanged(child.getId());
		assertEquals(200, reject(request, "{\"reason\":\"Outside the service area\"}").getStatus());

		assertStudentUnchanged(child.getId());
	}

	/** Contract: approving saves the address, and the request's pin is saved too. */
	@Test
	void approvingSavesTheAddressAndThePinOfTheRequest() throws Exception {
		Parent parent = aParent();
		Student child = aChildOf(parent, "Tarek");
		String request = submitted(parent, child.getId());

		MockHttpServletResponse response = approve(request);

		assertEquals(200, response.getStatus(), response.getContentAsString());
		assertEquals("approved", JsonPath.read(response.getContentAsString(), "$.status"));
		assertEquals(MondayClockConfig.MONDAY, Instant.parse(JsonPath.read(response.getContentAsString(), "$.decidedAt")));
		assertNull(JsonPath.<String>read(response.getContentAsString(), "$.rejectionReason"));
		assertEquals(KEYS, JsonPath.<Map<String, Object>>read(response.getContentAsString(), "$").keySet());
		assertStudentIs(child.getId(), NEW_ADDRESS, 33.8707, 35.4842);
	}

	/** Contract "Known limits": a manual pin stays when the request has none: the address changes, the old pin stays. */
	@Test
	void aRequestWithoutAPinKeepsTheStudentsManualPinAndChangesTheAddress() throws Exception {
		Parent parent = aParent();
		Student child = aChildOf(parent, "Tarek");
		MockHttpServletResponse sent = submit(parent, child.getId(), body(NEW_ADDRESS, null, null));
		String request = JsonPath.read(sent.getContentAsString(), "$.id");

		MockHttpServletResponse response = approve(request);

		assertEquals(200, response.getStatus(), response.getContentAsString());
		assertStudentIs(child.getId(), NEW_ADDRESS, SAVED_LAT.doubleValue(), SAVED_LNG.doubleValue());
	}

	// ---------------------------------------------------------------- reject

	/** Contract: "reason" is optional free text, at most 255 characters; blank means none. */
	@Test
	void aRejectReasonOf255IsKeptAnd256IsRefusedAndTheRequestStaysPending() throws Exception {
		Parent parent = aParent();
		String request = submitted(parent, aChildOf(parent, "Tarek").getId());
		String tooLong = "R".repeat(256);

		MockHttpServletResponse refused = reject(request, "{\"reason\":\"%s\"}".formatted(tooLong));

		assertEquals(400, refused.getStatus());
		assertTrue(JsonPath.<Map<String, Object>>read(refused.getContentAsString(), "$.errors").containsKey("reason"));
		assertEquals("pending", requestInList("pending", request).get("status"), "a refused rejection decides nothing");
		String longest = "R".repeat(255);
		MockHttpServletResponse accepted = reject(request, "{\"reason\":\"%s\"}".formatted(longest));
		assertEquals(200, accepted.getStatus(), accepted.getContentAsString());
		assertEquals(longest, JsonPath.read(accepted.getContentAsString(), "$.rejectionReason"));
		assertEquals("rejected", JsonPath.read(accepted.getContentAsString(), "$.status"));
		assertEquals(MondayClockConfig.MONDAY, Instant.parse(JsonPath.read(accepted.getContentAsString(), "$.decidedAt")));
	}

	/** Contract: a blank reason means none, and an empty object is a valid body. */
	@Test
	void aBlankReasonOrNoReasonLeavesRejectionReasonNull() throws Exception {
		Parent parent = aParent();
		for (String json : List.of("{\"reason\":\"   \"}", "{}", "{\"reason\":null}", "{\"reason\":\"\"}")) {
			String request = submitted(parent, aChildOf(parent, "Tarek").getId());

			MockHttpServletResponse response = reject(request, json);

			assertEquals(200, response.getStatus(), json + " -> " + response.getContentAsString());
			assertNull(JsonPath.<String>read(response.getContentAsString(), "$.rejectionReason"), json);
		}
	}

	/** Contract: the reason a head gives is on the rejected request, as in samples/address-requests/address-request-rejected.json. */
	@Test
	void aGivenReasonIsOnTheRejectedRequestForTheParentToRead() throws Exception {
		Parent parent = aParent();
		Student child = aChildOf(parent, "Tarek");
		String request = submitted(parent, child.getId());

		reject(request, "{\"reason\":\"Outside the school's service area.\"}");

		Map<String, Object> shown = JsonPath.read(parentList(parent, child.getId()).getContentAsString(), "$[0]");
		assertEquals("rejected", shown.get("status"));
		assertEquals("Outside the school's service area.", shown.get("rejectionReason"));
		assertEquals(KEYS, shown.keySet());
	}

	// ---------------------------------------------------------------- who may decide

	/** Contract: another school's request is a 404, never a 403; an unknown id is a 404; an id that does not parse is 400. */
	@Test
	void anotherSchoolsHeadAndAnUnknownIdGet404AndAMalformedIdGets400() throws Exception {
		Parent parent = aParent();
		String request = submitted(parent, aChildOf(parent, "Tarek").getId());
		RequestPostProcessor otherHead = headOf(UUID.randomUUID());

		List<MockHttpServletResponse> answers = List.of(approveAs(otherHead, request), rejectAs(otherHead, request, "{}"),
				approve(UUID.randomUUID().toString()), reject(UUID.randomUUID().toString(), "{}"));

		for (MockHttpServletResponse answer : answers) {
			assertEquals(404, answer.getStatus(), answer.getContentAsString());
		}
		assertEquals("pending", requestInList("pending", request).get("status"), "nothing was decided");
		MockHttpServletResponse approving = approve("not-a-uuid");
		MockHttpServletResponse rejecting = reject("not-a-uuid", "{}");
		assertEquals(400, approving.getStatus());
		assertEquals("Invalid request parameter", JsonPath.read(approving.getContentAsString(), "$.detail"));
		assertEquals(400, rejecting.getStatus());
		assertEquals("Invalid request parameter", JsonPath.read(rejecting.getContentAsString(), "$.detail"));
	}

	// ---------------------------------------------------------------- races (PostgreSQL)

	/** Contract: "one pending request per child": two submits at the same instant give one 201 and one 409, and one row. */
	@Test
	void twoSubmitsAtTheSameInstantGiveOneRequestAndOneConflict() throws Exception {
		Parent parent = aParent();
		for (int round = 0; round < 5; round++) {
			Student child = aChildOf(parent, "Tarek" + round);
			List<Callable<Integer>> calls = List.of(
					() -> submit(parent, child.getId(), body("First street", null, null)).getStatus(),
					() -> submit(parent, child.getId(), body("Second street", null, null)).getStatus());

			List<Integer> statuses = inParallel(calls);

			assertEquals(List.of(201, 409), sorted(statuses), "round " + round);
			assertEquals(1, JsonPath.<List<?>>read(parentList(parent, child.getId()).getContentAsString(), "$").size(),
					"round " + round);
		}
	}

	/** Two approvals of one request at once: one 200 and one 409, and the student has the address once. */
	@Test
	void twoApprovalsAtTheSameInstantGiveOneSuccessAndOneConflict() throws Exception {
		Parent parent = aParent();
		for (int round = 0; round < 5; round++) {
			Student child = aChildOf(parent, "Tarek" + round);
			String request = submitted(parent, child.getId());

			List<Integer> statuses = inParallel(List.of(() -> approve(request).getStatus(), () -> approve(request).getStatus()));

			assertEquals(List.of(200, 409), sorted(statuses), "round " + round);
			assertStudentIs(child.getId(), NEW_ADDRESS, 33.8707, 35.4842);
			assertEquals("approved", requestInList("approved", request).get("status"));
		}
	}

	/** Approve against reject at once: exactly one wins, the other is 409, and the student matches the winner. */
	@Test
	void anApprovalAgainstARejectionAtTheSameInstantHasOneWinnerAndTheStudentMatchesIt() throws Exception {
		Parent parent = aParent();
		for (int round = 0; round < 5; round++) {
			Student child = aChildOf(parent, "Tarek" + round);
			String request = submitted(parent, child.getId());

			List<Integer> statuses = inParallel(List.of(() -> approve(request).getStatus(),
					() -> reject(request, "{}").getStatus()));

			assertEquals(List.of(200, 409), sorted(statuses), "round " + round + ": " + statuses);
			if (statuses.get(0) == 200) {
				assertEquals("approved", requestInList("approved", request).get("status"));
				assertStudentIs(child.getId(), NEW_ADDRESS, 33.8707, 35.4842);
			}
			else {
				assertEquals("rejected", requestInList("rejected", request).get("status"));
				assertStudentUnchanged(child.getId());
			}
		}
	}

	// ---------------------------------------------------------------- the parent hears nothing

	/**
	 * Contract "Known limits": "no notification". So a decision leaves the parent's inbox empty. The stories (SCRUM-39 and
	 * 80) give the parent no word of the outcome through any other channel either; the report records that as a gap, and
	 * this test is named so that whoever adds an inbox entry for a decision sees the gap was meant to be closed here.
	 */
	@Test
	void aDecisionMakesNoInboxEntryAsTheContractSays() throws Exception {
		Parent parent = aParent();
		String approved = submitted(parent, aChildOf(parent, "Tarek").getId());
		String rejected = submitted(parent, aChildOf(parent, "Rana").getId());

		assertEquals(200, approve(approved).getStatus());
		assertEquals(200, reject(rejected, "{}").getStatus());

		assertEquals("[]", send(get("/api/parent/inbox").with(parent.session())).getContentAsString());
		assertEquals(0, (int) JsonPath.read(
				send(get("/api/parent/inbox/unread-count").with(parent.session())).getContentAsString(), "$.count"));
	}

	// ---------------------------------------------------------------- roles

	/** The five endpoints: 401 with an empty body when signed out, 403 for every other role. */
	@Test
	void everyEndpointIs401WhenSignedOutAnd403ForTheWrongRoles() throws Exception {
		UUID child = UUID.randomUUID();
		String request = UUID.randomUUID().toString();
		String valid = body(NEW_ADDRESS, null, null);
		for (Role role : List.of(Role.HEAD_OF_TRANSPORT, Role.ADMIN, Role.DRIVER)) {
			RequestPostProcessor who = loggedInAs(role, school, UUID.randomUUID());
			assertEquals(403, send(post("/api/parent/children/" + child + "/address-requests").with(who)
					.contentType(MediaType.APPLICATION_JSON).content(valid)).getStatus(), role + " submit");
			assertEquals(403, send(get("/api/parent/children/" + child + "/address-requests").with(who)).getStatus(),
					role + " parent list");
		}
		for (Role role : List.of(Role.PARENT, Role.ADMIN, Role.DRIVER)) {
			RequestPostProcessor who = loggedInAs(role, school, UUID.randomUUID());
			assertEquals(403, headListAs(who, null).getStatus(), role + " head list");
			assertEquals(403, approveAs(who, request).getStatus(), role + " approve");
			assertEquals(403, rejectAs(who, request, "{}").getStatus(), role + " reject");
		}
		List<MockHttpServletRequestBuilder> signedOut = List.of(
				post("/api/parent/children/" + child + "/address-requests").contentType(MediaType.APPLICATION_JSON).content(valid),
				get("/api/parent/children/" + child + "/address-requests"),
				get("/api/head-of-transport/address-requests"),
				post("/api/head-of-transport/address-requests/" + request + "/approve"),
				post("/api/head-of-transport/address-requests/" + request + "/reject")
						.contentType(MediaType.APPLICATION_JSON).content("{}"));
		for (MockHttpServletRequestBuilder call : signedOut) {
			MockHttpServletResponse response = send(call);
			assertEquals(401, response.getStatus());
			assertEquals("", response.getContentAsString(), "401 has an empty body");
		}
	}
}
