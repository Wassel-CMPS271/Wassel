package com.wassel.backend.vehicles.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.CriteriaTestSupport;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.vehicles.entity.Vehicle;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Regression test for a bug found in SCRUM-241 and fixed in SCRUM-259 (PR #110): see
 * docs/testing/SCRUM-236/SCRUM-236-bugs.md, BUG-2.
 *
 * <p>Criterion: "seats left on a route can never be negative". Sent one after the other, the reduction and the added
 * student never overfill the route (the second request gets 409). Sent at the same instant, both pass their check
 * before either writes, and the route ends with more students than seats. Each round is a fresh route with 7 students;
 * whichever way the requests interleave, afterwards the students must not outnumber the seats.
 */
class VehicleCapacityRaceCriteriaTests extends CriteriaTestSupport {

	private static final int ROUNDS = 10;

	private final UUID school = UUID.randomUUID();

	private record Fixture(Route route, Driver driver, Vehicle bus) {
	}

	/** A route with 7 students on an 8-seat bus: exactly one seat is free. */
	private Fixture aFullishRoute() {
		Vehicle bus = vehicle(school, 8);
		Driver driver = driver(school, UUID.randomUUID(), "Karim");
		Route route = route(school, "Race " + UUID.randomUUID().toString().substring(0, 6), bus, driver);
		for (int position = 1; position <= 7; position++) {
			onRoute(school, null, route, position, "Student" + position);
		}
		return new Fixture(route, driver, bus);
	}

	private int addStudent(Fixture f, Student student) throws Exception {
		return mockMvc.perform(post("/api/head-of-transport/routes/" + f.route().getId() + "/students")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID()))
						.contentType(MediaType.APPLICATION_JSON).content("{\"studentId\":\"" + student.getId() + "\"}"))
				.andReturn().getResponse().getStatus();
	}

	private int setCapacity(Fixture f, int capacity) throws Exception {
		return mockMvc.perform(patch("/api/head-of-transport/vehicles/" + f.bus().getId() + "/capacity")
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID()))
						.contentType(MediaType.APPLICATION_JSON).content("{\"capacity\":" + capacity + "}"))
				.andReturn().getResponse().getStatus();
	}

	private int useVehicle(Fixture f, Vehicle vehicle) throws Exception {
		return mockMvc.perform(put("/api/head-of-transport/routes/" + f.route().getId())
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID()))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"%s\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}"
								.formatted(f.route().getName(), vehicle.getId(), f.driver().getId())))
				.andReturn().getResponse().getStatus();
	}

	/** One entry per round in which the route ended with more students than seats. */
	private String overfull(Fixture f, List<Integer> statuses) throws Exception {
		String json = mockMvc.perform(get("/api/head-of-transport/routes/" + f.route().getId())
						.with(loggedInAs(Role.HEAD_OF_TRANSPORT, school, UUID.randomUUID())))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		int students = JsonPath.read(json, "$.studentCount");
		int seats = JsonPath.read(json, "$.vehicle.capacity");
		return students > seats ? "statuses " + statuses + " left " + students + " students on " + seats + " seats" : null;
	}

	@Test
	void aReductionAndAnAddedStudentAtTheSameTimeNeverOverfillTheRoute() throws Exception {
		List<String> bad = new ArrayList<>();
		for (int round = 0; round < ROUNDS; round++) {
			Fixture f = aFullishRoute();
			Student extra = child(school, null, "Extra");
			List<Callable<Integer>> both = List.of(() -> setCapacity(f, 7), () -> addStudent(f, extra));

			String problem = overfull(f, inParallel(both));
			if (problem != null) {
				bad.add("round " + round + ": " + problem);
			}
		}
		assertTrue(bad.isEmpty(), bad.size() + " of " + ROUNDS + " rounds overfull: " + bad);
	}

	@Test
	void aSmallerVehicleAndAnAddedStudentAtTheSameTimeNeverOverfillTheRoute() throws Exception {
		List<String> bad = new ArrayList<>();
		for (int round = 0; round < ROUNDS; round++) {
			Fixture f = aFullishRoute();
			Vehicle smaller = vehicle(school, 7);
			Student extra = child(school, null, "Extra");
			List<Callable<Integer>> both = List.of(() -> useVehicle(f, smaller), () -> addStudent(f, extra));

			String problem = overfull(f, inParallel(both));
			if (problem != null) {
				bad.add("round " + round + ": " + problem);
			}
		}
		assertTrue(bad.isEmpty(), bad.size() + " of " + ROUNDS + " rounds overfull: " + bad);
	}
}
