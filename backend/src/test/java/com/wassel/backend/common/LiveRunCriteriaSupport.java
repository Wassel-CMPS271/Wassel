package com.wassel.backend.common;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-272: fixtures for the independent tests of the driver's live location (SCRUM-261), the live ETA (262), the
 * offline replay (263) and the driver reassignment (264). Written from {@code docs/contracts/runs.md}, not from the
 * authors' own suites. Everything goes through the HTTP API; only what has no endpoint (accounts, pins) is saved
 * directly. "Now" is Wednesday 2026-11-04, 07:00 in Beirut, and each test has a school of its own.
 */
public abstract class LiveRunCriteriaSupport extends RunCriteriaSupport {

	protected static final String MORNING = "MORNING";

	protected static final String AFTERNOON = "AFTERNOON";

	protected static final double LONGITUDE = 35.50;

	// Three stops on one meridian, in this order, and where the bus usually is before the first one.
	protected static final double FIRST = 33.90;

	protected static final double SECOND = 33.91;

	protected static final double THIRD = 33.93;

	protected static final double BEFORE_FIRST = 33.89;

	private static final AtomicInteger UNIQUE = new AtomicInteger();

	/** A route of three stops, one parent each, its morning run started and not sharing. */
	protected record Trip(Bus bus, String run, UUID first, UUID second, UUID third, UUID parentOfFirst,
			UUID parentOfSecond, UUID parentOfThird) {
	}

	/** An active student with a pin (null latitude: no pin) on the meridian, and an optional parent. */
	protected UUID stopAt(String name, UUID parent, Double latitude) {
		int n = UNIQUE.incrementAndGet();
		return studentRepository.save(Student.builder().schoolId(school).firstName(name).lastName("Nasr").grade("4")
				.guardianName("Guardian of " + name).guardianPhone("+961 3 " + (600000 + n))
				.status(StudentStatus.ACTIVE).address(name + " Street, Beirut")
				.latitude(latitude == null ? null : BigDecimal.valueOf(latitude))
				.longitude(latitude == null ? null : BigDecimal.valueOf(LONGITUDE)).parentUserId(parent).build()).getId();
	}

	/** The bus of this driver on this route, as the helpers want it (a driver who took over a route has no bus of their own). */
	protected Bus busOf(UUID driverUserId, UUID driverId, UUID vehicleId, String routeId) {
		return new Bus(driverUserId, driverId, vehicleId, routeId);
	}

	protected Trip aStartedTrip(String routeName) throws Exception {
		UUID pFirst = aParent();
		UUID pSecond = aParent();
		UUID pThird = aParent();
		Bus bus = aBus(routeName);
		UUID first = stopAt("Rami", pFirst, FIRST);
		UUID second = stopAt("Salma", pSecond, SECOND);
		UUID third = stopAt("Dana", pThird, THIRD);
		onRoute(bus, first, second, third);
		String run = runId(bus, MORNING);
		assertEquals(200, start(bus, run).getStatus());
		return new Trip(bus, run, first, second, third, pFirst, pSecond, pThird);
	}

	// ---------------------------------------------------------------- the driver's location endpoints

	protected MockHttpServletResponse share(Bus bus, String run, Object enabled) throws Exception {
		return shareBody(bus.driverUserId(), run, "{\"enabled\":" + enabled + "}");
	}

	protected MockHttpServletResponse shareBody(UUID driverUser, String run, String json) throws Exception {
		return send(put("/api/driver/runs/" + run + "/location-sharing").with(as(Role.DRIVER, driverUser))
				.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	protected MockHttpServletResponse position(UUID driverUser, String run, String json) throws Exception {
		return send(put("/api/driver/runs/" + run + "/location").with(as(Role.DRIVER, driverUser))
				.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	protected static String fixBody(double latitude) {
		return "{\"latitude\":%s,\"longitude\":%s,\"accuracyMeters\":5}".formatted(latitude, LONGITUDE);
	}

	/** A position that must be accepted (204). */
	protected void fix(Bus bus, String run, double latitude) throws Exception {
		MockHttpServletResponse response = position(bus.driverUserId(), run, fixBody(latitude));
		assertEquals(204, response.getStatus(), response.getContentAsString());
	}

	protected void later(long seconds) {
		clock.set(clock.instant().plusSeconds(seconds));
	}

	// ---------------------------------------------------------------- what a parent and the head read

	protected MockHttpServletResponse parentReads(UUID parent, UUID child) throws Exception {
		return send(get("/api/parent/children/" + child + "/bus-location").with(as(Role.PARENT, parent)));
	}

	protected String parentSees(UUID parent, UUID child) throws Exception {
		MockHttpServletResponse response = parentReads(parent, child);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	protected String headSeesPositions() throws Exception {
		MockHttpServletResponse response = send(get(HEAD_RUNS + "/locations").with(head()));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	/** The one run of the head's locations list, by run id, at a path below it; fails if it is not listed once. */
	protected static Object positionOf(String list, String run, String path) {
		List<Object> found = JsonPath.read(list, "$[?(@.runId == '" + run + "')]" + path);
		assertEquals(1, found.size(), "the run " + run + " in the head's locations");
		return found.get(0);
	}

	protected static boolean listsRun(String list, String run) {
		return !((List<?>) JsonPath.read(list, "$[?(@.runId == '" + run + "')]")).isEmpty();
	}

	/** The head's summary of one run today. */
	protected String summaryOf(String run) throws Exception {
		List<Object> found = JsonPath.read(headRuns(null), "$.runs[?(@.id == '" + run + "')]");
		assertEquals(1, found.size(), "the run " + run + " in the head's day");
		return JsonPath.parse(found.get(0)).jsonString();
	}

	protected LocalTime plannedOf(Bus bus, UUID student) throws Exception {
		String route = send(get(ROUTES + "/" + bus.routeId()).with(head())).getContentAsString();
		List<String> times = JsonPath.read(route, "$.stops[?(@.studentId == '" + student + "')].arrivalTime");
		assertEquals(1, times.size());
		return LocalTime.parse(times.get(0));
	}

	protected static Integer whole(Object number) {
		return number == null ? null : ((Number) number).intValue();
	}

	// ---------------------------------------------------------------- requests at the same instant

	/** Runs the calls on their own threads, released together, and answers their HTTP statuses in the given order. */
	protected static List<Integer> together(List<Callable<Integer>> calls) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(calls.size());
		try {
			CountDownLatch ready = new CountDownLatch(calls.size());
			CountDownLatch go = new CountDownLatch(1);
			List<Future<Integer>> futures = new ArrayList<>();
			for (Callable<Integer> call : calls) {
				futures.add(pool.submit(() -> {
					ready.countDown();
					go.await();
					return call.call();
				}));
			}
			ready.await();
			go.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> future : futures) {
				statuses.add(future.get());
			}
			return statuses;
		}
		finally {
			pool.shutdownNow();
		}
	}
}
