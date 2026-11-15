package com.wassel.backend.addressrequests.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.CriteriaTestSupport;
import com.wassel.backend.geocoding.service.GeocodeResult;
import com.wassel.backend.geocoding.service.Geocoder;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SCRUM-266: what approving an address request does with the map pin, from the contract's "Approve saves the address in
 * the same transaction, the way the head's own address edit does: it is geocoded unless the student has a manual pin. If
 * the request has a pin, the pin is saved too and becomes a manual pin."
 *
 * <p>The only suite of this ticket with a double: the outside geocoding provider (Nominatim, a public service) is replaced
 * by a {@code Geocoder} double, the way {@code StudentGeocodingCriteriaTests} does. It is our code that is being tested,
 * not the provider. The cost is one more cached Spring context.
 *
 * <p>When the lookup finds nothing, the address-request contract says only "the way the head's own address edit does", so
 * the third test holds an approval to what the head's own edit does for the same student (and what
 * {@code backend/CLAUDE.md} documents for students: an empty lookup is not a failure and clears a pin that is not manual).
 * The contract's "if anything fails, the request stays pending" is not read as covering it; that ambiguity is in the report.
 */
class AddressRequestGeocodingCriteriaTests extends CriteriaTestSupport {

	private static final String NEW_ADDRESS = "Verdun Street 12, Beirut";

	private static final GeocodeResult FOUND = new GeocodeResult(new BigDecimal("33.871000"), new BigDecimal("35.484000"));

	@MockitoBean
	private Geocoder geocoder;

	private final UUID school = UUID.randomUUID();

	private final UUID parent = UUID.randomUUID();

	@BeforeEach
	void theProviderFindsNothingUnlessATestSaysOtherwise() {
		when(geocoder.geocode(any())).thenReturn(Optional.empty());
	}

	private Student aChild(boolean manualPin) {
		return studentRepository.save(Student.builder().schoolId(school).firstName("Tarek").lastName("Mansour").grade("3")
				.guardianName("Guardian").guardianPhone("+961 3 100 100").status(StudentStatus.ACTIVE)
				.address("Hamra Street, Beirut").latitude(new BigDecimal("33.893800")).longitude(new BigDecimal("35.501800"))
				.manualPin(manualPin).parentUserId(parent).build());
	}

	private RequestPostProcessor head() {
		return loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID());
	}

	private String submitted(UUID child, String pin) throws Exception {
		MockHttpServletRequestBuilder request = post("/api/parent/children/" + child + "/address-requests")
				.with(loggedInAs(Role.PARENT, school, parent)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"address\":\"%s\"%s}".formatted(NEW_ADDRESS, pin));
		MockHttpServletResponse response = mockMvc.perform(request).andReturn().getResponse();
		assertEquals(201, response.getStatus(), response.getContentAsString());
		return JsonPath.read(response.getContentAsString(), "$.id");
	}

	private void approved(String request) throws Exception {
		MockHttpServletResponse response = mockMvc.perform(
				post("/api/head-of-transport/address-requests/" + request + "/approve").with(head())).andReturn().getResponse();
		assertEquals(200, response.getStatus(), response.getContentAsString());
	}

	private void assertStudentIs(UUID id, String address, double lat, double lng) throws Exception {
		String body = mockMvc.perform(get("/api/head-of-transport/students").with(head())).andReturn().getResponse()
				.getContentAsString();
		List<Map<String, Object>> found = JsonPath.read(body, "$[?(@.id == '" + id + "')]");
		assertEquals(1, found.size());
		assertEquals(address, found.get(0).get("address"));
		assertEquals(lat, ((Number) found.get(0).get("latitude")).doubleValue(), 0.000001);
		assertEquals(lng, ((Number) found.get(0).get("longitude")).doubleValue(), 0.000001);
	}

	/** A student with no manual pin and a request with no pin: the pin becomes what the provider found for the NEW address. */
	@Test
	void approvingWithoutAPinGeocodesTheRequestedAddressWhenTheStudentHasNoManualPin() throws Exception {
		when(geocoder.geocode(eq(NEW_ADDRESS))).thenReturn(Optional.of(FOUND));
		Student child = aChild(false);
		String request = submitted(child.getId(), "");

		approved(request);

		verify(geocoder).geocode(NEW_ADDRESS);
		assertStudentIs(child.getId(), NEW_ADDRESS, 33.871, 35.484);
	}

	/** A manual pin is never moved by an address: no lookup at all, the old pin stays, the address changes. */
	@Test
	void approvingWithoutAPinNeverAsksTheProviderWhenTheStudentHasAManualPin() throws Exception {
		when(geocoder.geocode(any())).thenReturn(Optional.of(FOUND));
		Student child = aChild(true);
		String request = submitted(child.getId(), "");

		approved(request);

		verifyNoInteractions(geocoder);
		assertStudentIs(child.getId(), NEW_ADDRESS, 33.8938, 35.5018);
	}

	/**
	 * Contract: the request's pin is saved and "becomes a manual pin". The provider would answer something else for the
	 * address, so the pin shown must be the parent's. A later request with no pin must then keep it and never ask the provider.
	 */
	@Test
	void aPinInTheRequestWinsOverTheProviderAndBecomesAManualPin() throws Exception {
		when(geocoder.geocode(any())).thenReturn(Optional.of(FOUND));
		Student child = aChild(false);
		approved(submitted(child.getId(), ",\"latitude\":33.8707,\"longitude\":35.4842"));
		assertStudentIs(child.getId(), NEW_ADDRESS, 33.8707, 35.4842);
		clearInvocations(geocoder);

		String second = mockMvc.perform(post("/api/parent/children/" + child.getId() + "/address-requests")
				.with(loggedInAs(Role.PARENT, school, parent)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"address\":\"Sodeco Square, Beirut\"}")).andReturn().getResponse().getContentAsString();
		approved(JsonPath.read(second, "$.id"));

		verify(geocoder, never()).geocode(any());
		assertStudentIs(child.getId(), "Sodeco Square, Beirut", 33.8707, 35.4842);
	}

	/**
	 * A lookup that finds nothing (the double answers empty, as the real provider does when it is unreachable or has no match)
	 * is not a failure for the head's own edit: the address is saved and a pin that is not manual is cleared. An approval is "the
	 * way the head's own address edit does", so it must do exactly the same for an identical student, and the request is
	 * approved, not left pending.
	 */
	@Test
	void anApprovalWhenTheProviderFindsNothingDoesWhatTheHeadsOwnEditDoes() throws Exception {
		Student edited = aChild(false);
		Student requested = aChild(false);
		String request = submitted(requested.getId(), "");

		MockHttpServletResponse edit = mockMvc.perform(patch("/api/head-of-transport/students/" + edited.getId() + "/address")
				.with(head()).contentType(MediaType.APPLICATION_JSON).content("{\"address\":\"%s\"}".formatted(NEW_ADDRESS)))
				.andReturn().getResponse();
		assertEquals(200, edit.getStatus(), edit.getContentAsString());
		approved(request);

		Map<String, Object> afterEdit = studentShown(edited.getId());
		Map<String, Object> afterApproval = studentShown(requested.getId());
		assertEquals(NEW_ADDRESS, afterEdit.get("address"));
		assertEquals(afterEdit.get("address"), afterApproval.get("address"));
		assertEquals(afterEdit.get("latitude"), afterApproval.get("latitude"), "the pin, whatever the head's edit does with it");
		assertEquals(afterEdit.get("longitude"), afterApproval.get("longitude"));
		assertNull(afterApproval.get("latitude"), "an empty lookup clears a pin that is not manual (backend/CLAUDE.md, students)");
		assertNull(afterApproval.get("longitude"));
	}

	private Map<String, Object> studentShown(UUID id) throws Exception {
		String body = mockMvc.perform(get("/api/head-of-transport/students").with(head())).andReturn().getResponse()
				.getContentAsString();
		List<Map<String, Object>> found = JsonPath.read(body, "$[?(@.id == '" + id + "')]");
		assertEquals(1, found.size());
		return found.get(0);
	}
}
