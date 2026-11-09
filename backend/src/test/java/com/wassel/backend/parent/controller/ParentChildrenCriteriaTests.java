package com.wassel.backend.parent.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.CriteriaTestSupport;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.schools.entity.SchoolSettings;
import com.wassel.backend.schools.repository.SchoolSettingsRepository;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.vehicles.entity.Vehicle;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-240 (the parent's children), written for SCRUM-236 from the ticket's acceptance criteria and the "Child" shape of
 * docs/contracts/runs.md with its sample, not from {@code ParentControllerTests} or the module's code.
 *
 * <p>Independence note: {@code todayRun} on this endpoint is SCRUM-237, written by the same person who wrote this suite.
 * It is checked here only for presence (and null for a child with no route), never for its values; those belong to
 * SCRUM-237's own suite.
 */
class ParentChildrenCriteriaTests extends CriteriaTestSupport {

	private static final String URL = "/api/parent/children";

	private static final Path SAMPLE = Path.of("..", "docs", "contracts", "samples", "runs", "parent-children.json");

	@Autowired
	private SchoolSettingsRepository schoolSettingsRepository;

	private final UUID school = UUID.randomUUID();

	private final UUID parent = UUID.randomUUID();

	private String children(UUID schoolId, UUID asParent) throws Exception {
		return mockMvc.perform(get(URL).with(loggedInAs(Role.PARENT, schoolId, asParent)))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	private void arrivalAt(UUID schoolId, LocalTime time) {
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(schoolId).arrivalTime(time).build());
	}

	/** A route with its own vehicle and driver Karim (a phone included), and the given students on it, in order. */
	private Route routeWith(UUID schoolId, UUID asParent, String... firstNames) {
		Driver driver = driver(schoolId, UUID.randomUUID(), "Karim");
		Vehicle vehicle = vehicle(schoolId, 14);
		Route route = route(schoolId, "Hamra morning run", vehicle, driver);
		for (int i = 0; i < firstNames.length; i++) {
			onRoute(schoolId, asParent, route, i + 1, firstNames[i]);
		}
		return route;
	}

	private static Map<String, Object> named(String json, String firstName) {
		List<Map<String, Object>> all = JsonPath.read(json, "$");
		return all.stream().filter(c -> firstName.equals(c.get("firstName"))).findFirst().orElseThrow();
	}

	// ---- what a parent gets ----

	@Test
	void aChildOnARouteComesWithRouteDriverVehicleAndPickupTime() throws Exception {
		arrivalAt(school, LocalTime.of(8, 0));
		Route route = routeWith(school, parent, "Tarek");
		Driver driver = driverRepository.findById(route.getDriverId()).orElseThrow();
		Vehicle vehicle = vehicleRepository.findById(route.getVehicleId()).orElseThrow();

		String json = children(school, parent);

		Map<String, Object> tarek = named(json, "Tarek");
		assertNotNull(tarek.get("studentId"));
		assertEquals("Mansour", tarek.get("lastName"));
		assertEquals(Map.of("id", route.getId().toString(), "name", "Hamra morning run"), tarek.get("route"));
		assertEquals(Map.of("id", driver.getId().toString(), "firstName", "Karim", "lastName", "Haddad",
				"phone", driver.getPhone()), tarek.get("driver"));
		assertEquals(Map.of("id", vehicle.getId().toString(), "plateNumber", vehicle.getPlateNumber()), tarek.get("vehicle"));
		String pickup = (String) tarek.get("expectedPickupTime");
		assertTrue(pickup.matches("\\d\\d:\\d\\d"), "HH:mm, was " + pickup);
		assertTrue(pickup.compareTo("08:00") < 0 && pickup.compareTo("06:00") >= 0, "before school starts: " + pickup);
	}

	@Test
	void theFirstStopIsPickedUpBeforeTheSecond() throws Exception {
		arrivalAt(school, LocalTime.of(8, 0));
		routeWith(school, parent, "Rami", "Salma");

		String json = children(school, parent);

		String first = (String) named(json, "Rami").get("expectedPickupTime");
		String second = (String) named(json, "Salma").get("expectedPickupTime");
		assertTrue(first.compareTo(second) < 0, first + " should be before " + second);
	}

	@Test
	void theExpectedPickupTimeIsTheArrivalTimeOfThatStudentsStopOnTheRoute() throws Exception {
		arrivalAt(school, LocalTime.of(8, 0));
		Route route = routeWith(school, parent, "Rami", "Salma", "Tarek");
		String routeJson = mockMvc.perform(get("/api/head-of-transport/routes/" + route.getId())
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID())))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		String json = children(school, parent);

		for (String name : List.of("Rami", "Salma", "Tarek")) {
			Object studentId = named(json, name).get("studentId");
			String stopTime = JsonPath.<List<String>>read(routeJson, "$.stops[?(@.studentId=='" + studentId + "')].arrivalTime").get(0);
			assertNotNull(stopTime, name + " has a time on the route");
			assertEquals(stopTime, named(json, name).get("expectedPickupTime"), name);
		}
	}

	@Test
	void withNoSchoolArrivalTimeThereIsNoPickupTimeButTheRouteIsStillShown() throws Exception {
		routeWith(school, parent, "Tarek");

		Map<String, Object> tarek = named(children(school, parent), "Tarek");

		assertNull(tarek.get("expectedPickupTime"));
		assertNotNull(tarek.get("route"));
		assertNotNull(tarek.get("driver"));
		assertNotNull(tarek.get("vehicle"));
	}

	@Test
	void aChildWithNoRouteYetHasNullRouteDriverVehicleAndTimeInsteadOfAnError() throws Exception {
		arrivalAt(school, LocalTime.of(8, 0));
		child(school, parent, "Layla");

		Map<String, Object> layla = named(children(school, parent), "Layla");

		assertTrue(layla.containsKey("route") && layla.containsKey("driver") && layla.containsKey("vehicle")
				&& layla.containsKey("expectedPickupTime"), "the fields are present, set to null");
		assertNull(layla.get("route"));
		assertNull(layla.get("driver"));
		assertNull(layla.get("vehicle"));
		assertNull(layla.get("expectedPickupTime"));
		assertTrue(layla.containsKey("todayRun"));
		assertNull(layla.get("todayRun"));
	}

	@Test
	void aChildOnARouteHasATodayRunField() throws Exception {
		routeWith(school, parent, "Tarek");
		assertTrue(named(children(school, parent), "Tarek").containsKey("todayRun"));
	}

	@Test
	void everyChildIsListedOrderedByFirstName() throws Exception {
		child(school, parent, "Omar");
		child(school, parent, "Layla");
		routeWith(school, parent, "Nour");

		mockMvc.perform(get(URL).with(loggedInAs(Role.PARENT, school, parent))).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0].firstName").value("Layla"))
				.andExpect(jsonPath("$[1].firstName").value("Nour"))
				.andExpect(jsonPath("$[2].firstName").value("Omar"));
	}

	@Test
	void aParentWithNoChildrenGetsAnEmptyList() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.PARENT, school, UUID.randomUUID()))).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	// ---- other families' children (security) ----

	@Test
	void aParentNeverSeesChildrenLinkedToSomeoneElse() throws Exception {
		UUID otherParent = UUID.randomUUID();
		child(school, parent, "Layla");
		child(school, otherParent, "NotMine");
		routeWith(school, otherParent, "AlsoNotMine");
		child(school, null, "Unlinked");

		String json = children(school, parent);

		assertEquals(1, ((List<?>) JsonPath.read(json, "$")).size());
		assertEquals("Layla", named(json, "Layla").get("firstName"));
		assertEquals(1, ((List<?>) JsonPath.read(children(school, otherParent), "$[?(@.firstName=='NotMine')]")).size());
	}

	@Test
	void theSameUserIdInAnotherSchoolSeesNoneOfThisSchoolsChildren() throws Exception {
		child(school, parent, "Layla");
		UUID otherSchool = UUID.randomUUID();

		mockMvc.perform(get(URL).with(loggedInAs(Role.PARENT, otherSchool, parent))).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void aSiblingsRouteAndDriverAreNotMixedUp() throws Exception {
		arrivalAt(school, LocalTime.of(8, 0));
		Route route = routeWith(school, parent, "Tarek");
		child(school, parent, "Layla");

		String json = children(school, parent);

		assertEquals(route.getId().toString(), ((Map<?, ?>) named(json, "Tarek").get("route")).get("id"));
		assertNull(named(json, "Layla").get("route"));
	}

	// ---- who may call it ----

	@Test
	void onlyTheParentRoleCanCallIt() throws Exception {
		for (Role role : List.of(Role.HEAD_OF_TRANSPORT, Role.DRIVER, Role.ADMIN)) {
			mockMvc.perform(get(URL).with(loggedInAs(role, school, parent))).andExpect(status().isForbidden());
		}
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
	}

	// ---- the contract's sample ----

	@Test
	@SuppressWarnings("unchecked")
	void theResponseHasTheFieldsOfTheContractSample() throws Exception {
		List<Map<String, Object>> sample = JsonPath.read(Files.readString(SAMPLE), "$");
		Map<String, Object> sampleWithRoute = sample.stream().filter(c -> c.get("route") != null).findFirst().orElseThrow();
		Map<String, Object> sampleWithout = sample.stream().filter(c -> c.get("route") == null).findFirst().orElseThrow();
		arrivalAt(school, LocalTime.of(8, 0));
		routeWith(school, parent, "Tarek");
		child(school, parent, "Layla");

		String json = children(school, parent);
		Map<String, Object> withRoute = named(json, "Tarek");
		Map<String, Object> without = named(json, "Layla");

		assertEquals(sampleWithRoute.keySet(), withRoute.keySet(), "a child with a route");
		assertEquals(sampleWithout.keySet(), without.keySet(), "a child with no route");
		for (String nested : List.of("route", "driver", "vehicle")) {
			assertEquals(((Map<String, Object>) sampleWithRoute.get(nested)).keySet(),
					((Map<String, Object>) withRoute.get(nested)).keySet(), nested);
		}
		assertTrue(((String) withRoute.get("expectedPickupTime")).matches("\\d\\d:\\d\\d"));
	}
}
