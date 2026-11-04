package com.wassel.backend.vehicles.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.CriteriaTestSupport;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.vehicles.entity.Vehicle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;

import static org.hamcrest.Matchers.matchesPattern;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-241 (vehicle seats cannot drop below the students on its route), written for SCRUM-236 from the ticket's
 * acceptance criteria and the 409 row of docs/contracts/routing.md ("Adding beyond capacity"), not from the PR. Both
 * paths of the ticket: {@code PATCH /vehicles/{id}/capacity} and {@code PUT /routes/{id}} with a smaller vehicle. The
 * route has 7 students and the too-small capacity is 2, so a message that "includes the count and the capacity" is
 * matched on whole numbers (7 and 2), which a plate, an id or a date in the text cannot satisfy by accident.
 *
 * <p>The two races (a reduction against an added student) are in {@link VehicleCapacityRaceCriteriaTests}, which
 * covers a bug found and fixed in SCRUM-259. Not asserted, because the sources disagree (see the SCRUM-236 report): routing.md says
 * {@code seatsLeft} "is negative when the route is over capacity"; the ticket says it can never be. These tests assert
 * the ticket, which is what the new rule enforces.
 */
class VehicleCapacityCriteriaTests extends CriteriaTestSupport {

	static final int STUDENTS = 7;

	static final int TOO_FEW_SEATS = 2;

	private final UUID school = UUID.randomUUID();

	private Vehicle bus;

	private Driver driver;

	private Route route;

	/** A 9-seat bus on a route with 7 students: two seats left. */
	@BeforeEach
	void aRouteWithSevenStudentsOnANineSeatBus() {
		bus = vehicle(school, 9);
		driver = driver(school, UUID.randomUUID(), "Karim");
		route = route(school, "Hamra morning run", bus, driver);
		for (int position = 1; position <= STUDENTS; position++) {
			onRoute(school, null, route, position, "Student" + position);
		}
	}

	// ---- helpers ----

	private ResultActions setCapacity(UUID vehicleId, int capacity) throws Exception {
		return mockMvc.perform(patch("/api/head-of-transport/vehicles/" + vehicleId + "/capacity")
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID()))
				.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":" + capacity + "}"));
	}

	private ResultActions putVehicleOnRoute(UUID vehicleId) throws Exception {
		return mockMvc.perform(put("/api/head-of-transport/routes/" + route.getId())
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID()))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"Hamra morning run\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}"
						.formatted(vehicleId, driver.getId())));
	}

	private int capacityOf(UUID vehicleId) throws Exception {
		String json = mockMvc.perform(get("/api/head-of-transport/vehicles")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID())))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		return JsonPath.<List<Integer>>read(json, "$[?(@.id=='" + vehicleId + "')].capacity").get(0);
	}

	private String routeJson() throws Exception {
		return mockMvc.perform(get("/api/head-of-transport/routes/" + route.getId())
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID())))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	/**
	 * "Seats left on a route can never be negative", checked on this test's own route, which must be present with all
	 * its students and a real {@code seatsLeft} (a missing field fails here instead of looping over nothing), and then
	 * on every route the school has.
	 */
	private void assertNoRouteIsOverfull() throws Exception {
		String mine = routeJson();
		assertEquals(STUDENTS, JsonPath.<Integer>read(mine, "$.studentCount"));
		assertTrue(JsonPath.<Integer>read(mine, "$.seatsLeft") >= 0, "seatsLeft of the route under test");
		String all = mockMvc.perform(get("/api/head-of-transport/routes")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID())))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		assertEquals(1, JsonPath.<List<Integer>>read(all, "$[?(@.id=='" + route.getId() + "')].seatsLeft").size());
		for (Integer seatsLeft : JsonPath.<List<Integer>>read(all, "$[*].seatsLeft")) {
			assertTrue(seatsLeft >= 0, "seatsLeft was " + seatsLeft);
		}
	}

	private static String wholeNumber(int n) {
		return "(?s).*(?<![\\w-])" + n + "(?![\\w-]).*";
	}

	// ---- path 1: lowering a vehicle's capacity ----

	@Test
	void loweringSeatsBelowTheStudentsOnItsRouteIsRefusedWithTheCountAndTheCapacity() throws Exception {
		setCapacity(bus.getId(), TOO_FEW_SEATS).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(matchesPattern(wholeNumber(STUDENTS))))
				.andExpect(jsonPath("$.detail").value(matchesPattern(wholeNumber(TOO_FEW_SEATS))));

		assertEquals(9, capacityOf(bus.getId()), "nothing changed");
		assertNoRouteIsOverfull();
	}

	@Test
	void oneSeatFewerThanTheStudentsIsRefusedToo() throws Exception {
		setCapacity(bus.getId(), STUDENTS - 1).andExpect(status().isConflict());
		assertEquals(9, capacityOf(bus.getId()));
	}

	@Test
	void loweringSeatsToExactlyTheNumberOfStudentsIsAllowed() throws Exception {
		setCapacity(bus.getId(), STUDENTS).andExpect(status().is2xxSuccessful());

		assertEquals(STUDENTS, capacityOf(bus.getId()));
		assertEquals(0, JsonPath.<Integer>read(routeJson(), "$.seatsLeft"));
	}

	@Test
	void aVehicleNotOnAnyRouteCanBeSetToAnyValidCapacity() throws Exception {
		Vehicle spare = vehicle(school, 10);

		setCapacity(spare.getId(), 1).andExpect(status().is2xxSuccessful());
		assertEquals(1, capacityOf(spare.getId()));
		setCapacity(spare.getId(), 30).andExpect(status().is2xxSuccessful());
		assertEquals(30, capacityOf(spare.getId()));
	}

	@Test
	void raisingSeatsOnAVehicleWithARouteIsAllowed() throws Exception {
		setCapacity(bus.getId(), 20).andExpect(status().is2xxSuccessful());
		assertEquals(20, capacityOf(bus.getId()));
	}

	@Test
	void twoReductionsAtTheSameTimeLeaveTheBusWithEnoughSeats() throws Exception {
		for (int round = 0; round < 5; round++) {
			setCapacity(bus.getId(), 9).andExpect(status().is2xxSuccessful());
			List<Callable<Integer>> both = List.of(
					() -> setCapacity(bus.getId(), 8).andReturn().getResponse().getStatus(),
					() -> setCapacity(bus.getId(), TOO_FEW_SEATS).andReturn().getResponse().getStatus());

			List<Integer> statuses = inParallel(both);

			assertTrue(statuses.get(0) >= 200 && statuses.get(0) < 300, "to 8 seats (allowed): " + statuses);
			assertEquals(409, statuses.get(1), "to " + TOO_FEW_SEATS + " seats (refused): " + statuses);
			assertEquals(8, capacityOf(bus.getId()));
			assertNoRouteIsOverfull();
		}
	}

	// ---- path 2: a smaller vehicle on a route ----

	@Test
	void aSmallerVehicleThanTheStudentsOnTheRouteIsRefusedTheSameWay() throws Exception {
		Vehicle minibus = vehicle(school, TOO_FEW_SEATS);

		putVehicleOnRoute(minibus.getId()).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(matchesPattern(wholeNumber(STUDENTS))))
				.andExpect(jsonPath("$.detail").value(matchesPattern(wholeNumber(TOO_FEW_SEATS))));

		assertEquals(bus.getId().toString(), JsonPath.<String>read(routeJson(), "$.vehicle.id"), "the route kept its bus");
		assertNoRouteIsOverfull();
	}

	@Test
	void aVehicleWithExactlyAsManySeatsAsStudentsIsAllowedOnTheRoute() throws Exception {
		Vehicle exact = vehicle(school, STUDENTS);

		putVehicleOnRoute(exact.getId()).andExpect(status().is2xxSuccessful());

		assertEquals(exact.getId().toString(), JsonPath.<String>read(routeJson(), "$.vehicle.id"));
		assertEquals(0, JsonPath.<Integer>read(routeJson(), "$.seatsLeft"));
	}

	@Test
	void aBiggerVehicleIsAllowedOnTheRoute() throws Exception {
		Vehicle big = vehicle(school, 30);

		putVehicleOnRoute(big.getId()).andExpect(status().is2xxSuccessful());
		assertEquals(30 - STUDENTS, JsonPath.<Integer>read(routeJson(), "$.seatsLeft"));
	}
}
