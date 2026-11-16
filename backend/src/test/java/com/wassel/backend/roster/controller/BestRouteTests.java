package com.wassel.backend.roster.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.LiveRunCriteriaSupport;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.schools.entity.SchoolSettings;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.vehicles.entity.Vehicle;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static com.jayway.jsonpath.JsonPath.read;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-270, docs/contracts/roster.md "Best route for a student". Real app, PostgreSQL, every migration; the test profile
 * has no road provider, so a leg is the routing contract's straight line (30 km/h, each leg rounded up to whole minutes).
 *
 * <p>The numbers are worked out by hand. The school is at latitude 33.896 and every stop is on its meridian, so a leg is
 * a difference of latitudes and one degree is 111.195 km, which is 222.39 minutes: 0.01 degree is 2.22 minutes (3), 0.02
 * is 4.45 (5), 0.04 is 8.90 (9), 0.05 is 11.12 (12), 0.06 is 13.34 (14). The school's arrival time is 07:30.
 *
 * <p>Route "Alpha" has two stops, 33.956 then 33.916, then the school: 9 + 5 = 14 minutes. A student at 33.936 fits
 * between them: 5 + 5 + 5 = 15, so one minute more, at stop 2, picked up at 07:30 - 5 - 5 = 07:20. At the start it would
 * cost 5 + 9 + 5 = 19 (5 more), at the end 9 + 5 + 9 = 23 (9 more). An empty route would drive 33.936 to the school: 9
 * minutes, picked up at 07:21.
 */
class BestRouteTests extends LiveRunCriteriaSupport {

	private static final double SCHOOL_LONGITUDE = 35.484;

	private static final AtomicInteger UNIQUE = new AtomicInteger();

	@Autowired
	private RouteRepository routeRepository;

	private UUID studentAt(String name, double latitude) {
		int n = UNIQUE.incrementAndGet();
		return studentRepository.save(Student.builder().schoolId(school).firstName(name).lastName("Nasr").grade("4")
				.guardianName("Guardian of " + name).guardianPhone("+961 3 " + (300000 + n)).status(StudentStatus.ACTIVE)
				.address(name + " Street, Beirut").latitude(BigDecimal.valueOf(latitude))
				.longitude(BigDecimal.valueOf(SCHOOL_LONGITUDE)).parentUserId(aParent()).build()).getId();
	}

	private UUID studentWithNoPin(String name) {
		int n = UNIQUE.incrementAndGet();
		return studentRepository.save(Student.builder().schoolId(school).firstName(name).lastName("Nasr").grade("4")
				.guardianName("Guardian of " + name).guardianPhone("+961 3 " + (300000 + n)).status(StudentStatus.ACTIVE)
				.parentUserId(aParent()).build()).getId();
	}

	/** A route of a vehicle with this many seats and its own driver, with these students as its stops in this order. */
	private Bus route(String name, int seats, UUID... stops) throws Exception {
		UUID user = aDriverAccount();
		UUID driver = aDriverRecord(user);
		UUID vehicle = vehicleRepository.save(Vehicle.builder().schoolId(school)
				.plateNumber("B " + (100000 + UNIQUE.incrementAndGet())).capacity(seats).active(true).build()).getId();
		String body = send(post(ROUTES).with(head()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"%s\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}".formatted(name, vehicle, driver)))
				.getContentAsString();
		Bus bus = busOf(user, driver, vehicle, read(body, "$.id"));
		onRoute(bus, stops);
		return bus;
	}

	private void arrivalAt(LocalTime arrival) {
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(school).arrivalTime(arrival)
				.dismissalTime(LocalTime.of(14, 0)).build());
	}

	private MockHttpServletResponse best(UUID student) throws Exception {
		return send(get("/api/head-of-transport/students/" + student + "/best-route").with(head()));
	}

	private String ranked(UUID student) throws Exception {
		MockHttpServletResponse response = best(student);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private MockHttpServletResponse place(UUID student) throws Exception {
		return send(post("/api/head-of-transport/students/" + student + "/best-route").with(head()));
	}

	private String routeJson(Bus bus) throws Exception {
		return send(get(ROUTES + "/" + bus.routeId()).with(head())).getContentAsString();
	}

	private List<String> stopIds(Bus bus) throws Exception {
		return read(routeJson(bus), "$.stops[*].studentId");
	}

	/** Every stop of every route of the school, one entry per stop. */
	private List<String> everyoneOnARoute() throws Exception {
		List<String> ids = new ArrayList<>();
		for (String routeId : JsonPath.<List<String>>read(send(get(ROUTES).with(head())).getContentAsString(), "$[*].id")) {
			ids.addAll(JsonPath.<List<String>>read(send(get(ROUTES + "/" + routeId).with(head())).getContentAsString(),
					"$.stops[*].studentId"));
		}
		return ids;
	}

	private static Integer whole(String json, String path) {
		return ((Number) read(json, path)).intValue();
	}

	// ---------------------------------------------------------------- where on a route

	@Test
	void theStudentGoesBetweenTheTwoStopsWhereItAddsOneMinuteAndTheOtherRouteWouldAddNine() throws Exception {
		UUID far = studentAt("Far", 33.956);
		UUID near = studentAt("Near", 33.916);
		Bus alpha = route("Alpha", 14, far, near);
		Bus beta = route("Beta", 14);
		UUID rami = studentAt("Rami", 33.936);

		String answer = ranked(rami);

		assertEquals(alpha.routeId(), read(answer, "$.recommended.routeId"));
		assertEquals("Alpha", read(answer, "$.recommended.routeName"));
		assertEquals(2, whole(answer, "$.recommended.position"), "between the two stops");
		assertEquals(1, whole(answer, "$.recommended.extraMinutes"), "5 + 5 + 5 less 9 + 5");
		assertEquals("07:20", read(answer, "$.recommended.arrivalTime"));
		assertEquals(12, whole(answer, "$.recommended.seatsLeft"));
		assertEquals(List.of(alpha.routeId(), beta.routeId()), read(answer, "$.options[*].routeId"), "best first");
		assertEquals(9, whole(answer, "$.options[1].extraMinutes"), "the empty route: 33.936 to the school is 9");
		assertEquals(1, whole(answer, "$.options[1].position"));
		assertEquals("07:21", read(answer, "$.options[1].arrivalTime"));
		assertEquals(rami.toString(), read(answer, "$.studentId"));
		assertEquals(List.of(), read(answer, "$.skipped"));
	}

	@Test
	void theBestPlaceCanBeTheStartTheMiddleOrTheEnd() throws Exception {
		UUID far = studentAt("Far", 33.956);
		UUID near = studentAt("Near", 33.916);
		route("Alpha", 14, far, near);

		String beforeAll = ranked(studentAt("Early", 33.976));
		assertEquals(1, whole(beforeAll, "$.recommended.position"), "beyond the first stop: 5 + 9 + 5 less 14");
		assertEquals(5, whole(beforeAll, "$.recommended.extraMinutes"));
		assertEquals("07:11", read(beforeAll, "$.recommended.arrivalTime"), "07:30 - 5 - 9 is 07:16 at the old first stop, less 5");

		String afterAll = ranked(studentAt("Late", 33.906));
		assertEquals(3, whole(afterAll, "$.recommended.position"), "between the last stop and the school: 9 + 3 + 3 less 14");
		assertEquals(1, whole(afterAll, "$.recommended.extraMinutes"));
		assertEquals("07:27", read(afterAll, "$.recommended.arrivalTime"));
	}

	@Test
	void placingTheStudentPutsThemAtThatPlaceRenumbersTheStopsAndRepeatingItIs409() throws Exception {
		UUID far = studentAt("Far", 33.956);
		UUID near = studentAt("Near", 33.916);
		Bus alpha = route("Alpha", 14, far, near);
		route("Beta", 14);
		UUID rami = studentAt("Rami", 33.936);

		MockHttpServletResponse placed = place(rami);

		assertEquals(201, placed.getStatus(), placed.getContentAsString());
		String body = placed.getContentAsString();
		assertEquals(2, whole(body, "$.position"));
		assertEquals(1, whole(body, "$.extraMinutes"));
		assertEquals("07:20", read(body, "$.arrivalTime"));
		assertEquals(alpha.routeId(), read(body, "$.route.id"));
		assertEquals(List.of(far.toString(), rami.toString(), near.toString()), stopIds(alpha));
		assertEquals(List.of(1, 2, 3), read(routeJson(alpha), "$.stops[*].position"), "a clean 1..n");
		assertEquals(List.of("07:15", "07:20", "07:25"), read(routeJson(alpha), "$.stops[*].arrivalTime"),
				"the route's own schedule agrees with the pickup time that was promised");
		assertEquals(11, whole(routeJson(alpha), "$.seatsLeft"));

		MockHttpServletResponse again = place(rami);
		assertEquals(409, again.getStatus(), "already on a route");
		assertEquals(409, best(rami).getStatus());
		assertEquals(List.of(far.toString(), rami.toString(), near.toString()), stopIds(alpha), "nothing moved");
	}

	@Test
	void askingChangesNothingAndTheSameAnswerComesBackEveryTime() throws Exception {
		UUID far = studentAt("Far", 33.956);
		Bus alpha = route("Alpha", 14, far);
		UUID rami = studentAt("Rami", 33.936);
		String routeBefore = routeJson(alpha);

		String first = ranked(rami);
		String second = ranked(rami);

		assertEquals(first, second);
		assertEquals(routeBefore, routeJson(alpha));
	}

	@Test
	void aStopWithNoPinIsOnTheRouteButNotOnTheScheduleSoTheNewStopGoesAfterItsNeighbour() throws Exception {
		UUID far = studentAt("Far", 33.956);
		UUID unpinned = studentWithNoPin("Nopin");
		UUID near = studentAt("Near", 33.916);
		Bus alpha = route("Alpha", 14, far, unpinned, near);
		UUID rami = studentAt("Rami", 33.936);

		String answer = ranked(rami);

		assertEquals(3, whole(answer, "$.recommended.position"), "before the second pinned stop, after the stop with no pin");
		assertEquals(1, whole(answer, "$.recommended.extraMinutes"), "the stop with no pin adds no leg");
		assertEquals(11, whole(answer, "$.recommended.seatsLeft"), "but it holds a seat");
		assertEquals(201, place(rami).getStatus());
		assertEquals(List.of(far.toString(), unpinned.toString(), rami.toString(), near.toString()), stopIds(alpha));
	}

	@Test
	void whenTwoRoutesAddTheSameTimeTheOneNamedFirstWins() throws Exception {
		route("Zeta", 14);
		route("Alpha", 14);
		UUID rami = studentAt("Rami", 33.936);

		String answer = ranked(rami);

		assertEquals(List.of("Alpha", "Zeta"), read(answer, "$.options[*].routeName"));
		assertEquals("Alpha", read(answer, "$.recommended.routeName"));
	}

	// ---------------------------------------------------------------- seats

	@Test
	void aRouteWithOneSeatLeftIsAnOptionAndAFullRouteIsSkippedWithTheReason() throws Exception {
		UUID a = studentAt("A", 33.956);
		UUID b = studentAt("B", 33.916);
		Bus oneLeft = route("One seat left", 3, a, b);
		UUID c = studentAt("C", 33.966);
		UUID d = studentAt("D", 33.926);
		Bus full = route("Full", 2, c, d);
		UUID rami = studentAt("Rami", 33.936);

		String answer = ranked(rami);

		assertEquals(List.of(oneLeft.routeId()), read(answer, "$.options[*].routeId"));
		assertEquals(1, whole(answer, "$.options[0].seatsLeft"), "exactly one seat left is enough");
		assertEquals(List.of(full.routeId()), read(answer, "$.skipped[*].routeId"));
		assertEquals(List.of("FULL"), read(answer, "$.skipped[*].reason"));

		assertEquals(201, place(rami).getStatus());
		UUID next = studentAt("Next", 33.940);
		String after = ranked(next);
		assertNull(read(after, "$.recommended"), "the last seat was taken: no route has room now");
		assertEquals(List.of("FULL", "FULL"), read(after, "$.skipped[*].reason"));
		assertEquals(409, place(next).getStatus());
		assertEquals(2, stopIds(full).size(), "the full route kept its two students");
	}

	@Test
	void whenNoRouteCanTakeTheStudentTheRankingSaysSoAndPlacingIs409() throws Exception {
		UUID c = studentAt("C", 33.966);
		route("Full", 1, c);
		UUID rami = studentAt("Rami", 33.936);

		String answer = ranked(rami);

		assertNull(read(answer, "$.recommended"));
		assertEquals(List.of(), read(answer, "$.options"));
		MockHttpServletResponse refused = place(rami);
		assertEquals(409, refused.getStatus(), refused.getContentAsString());
		assertEquals("No route has a free seat and a schedule that can be driven for this student.",
				read(refused.getContentAsString(), "$.detail"));
	}

	@Test
	void aSchoolWithNoRoutesHasNoOption() throws Exception {
		UUID rami = studentAt("Rami", 33.936);

		String answer = ranked(rami);

		assertNull(read(answer, "$.recommended"));
		assertEquals(List.of(), read(answer, "$.options"));
		assertEquals(List.of(), read(answer, "$.skipped"));
		assertEquals(409, place(rami).getStatus());
	}

	@Test
	void twoStudentsAskingForTheLastSeatAtOnceOneGetsItAndTheOtherCanAskAgain() throws Exception {
		for (int round = 0; round < 3; round++) {
			UUID a = studentAt("A", 33.956);
			Bus alpha = route("Alpha " + round, 2, a);
			Bus beta = route("Beta " + round, 14);
			UUID x = studentAt("X", 33.936);
			UUID y = studentAt("Y", 33.937);

			List<Integer> statuses = together(List.of(() -> place(x).getStatus(), () -> place(y).getStatus()));

			assertTrue(statuses.contains(201), "one of them is placed: " + statuses);
			assertTrue(stopIds(alpha).size() <= 2, "never more students than seats: " + stopIds(alpha));
			UUID loser = statuses.get(0) == 201 ? y : x;
			if (statuses.contains(409)) {
				assertEquals(201, place(loser).getStatus(), "asking again finds the room that is left");
			}
			// Earlier rounds leave routes with room in this school, so the loser may land on one of those: look at all of them.
			List<String> everyone = everyoneOnARoute();
			assertTrue(everyone.contains(x.toString()) && everyone.contains(y.toString()),
					"statuses " + statuses + ", x=" + x + ", y=" + y + ", on routes: " + everyone);
			assertEquals(1, everyone.stream().filter(id -> id.equals(x.toString())).count(), "and each on one route only");
		}
	}

	// ---------------------------------------------------------------- the schedule

	@Test
	void aRouteWhoseFirstPickupWouldBeBefore0600IsSkippedAndOneAtExactly0600IsAnOption() throws Exception {
		UUID far = studentAt("Far", 33.956);
		UUID near = studentAt("Near", 33.916);
		Bus alpha = route("Alpha", 14, far, near);
		Bus beta = route("Beta", 14);
		UUID rami = studentAt("Rami", 33.936);

		arrivalAt(LocalTime.of(6, 10));
		String early = ranked(rami);
		assertEquals(List.of(beta.routeId()), read(early, "$.options[*].routeId"),
				"Alpha: 15 minutes before 06:10 is 05:55; Beta: 9 minutes is 06:01");
		assertEquals(List.of(alpha.routeId()), read(early, "$.skipped[*].routeId"));
		assertEquals(List.of("STARTS_TOO_EARLY"), read(early, "$.skipped[*].reason"));
		assertEquals("06:01", read(early, "$.recommended.arrivalTime"));

		arrivalAt(LocalTime.of(6, 9));
		String exactly = ranked(rami);
		assertEquals(List.of(beta.routeId()), read(exactly, "$.options[*].routeId"));
		assertEquals("06:00", read(exactly, "$.recommended.arrivalTime"), "exactly 06:00 can be driven");
		arrivalAt(LocalTime.of(6, 8));
		String tooEarly = ranked(rami);
		assertEquals(List.of(), read(tooEarly, "$.options"), "05:59 cannot");
		assertEquals(List.of("STARTS_TOO_EARLY", "STARTS_TOO_EARLY"), read(tooEarly, "$.skipped[*].reason"));
		assertEquals(409, place(rami).getStatus());
	}

	// ---------------------------------------------------------------- the student

	@Test
	void aStudentWhoIsNotActiveOnARouteOrWithoutAPinCannotBePlacedAndTheSchoolNeedsAnArrivalTime() throws Exception {
		route("Alpha", 14);
		UUID onRoute = studentAt("Placed", 33.936);
		assertEquals(201, place(onRoute).getStatus());
		UUID paused = studentAt("Paused", 33.930);
		assertEquals(200, send(put("/api/head-of-transport/students/" + paused + "/status").with(head())
				.contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"paused\"}")).getStatus());
		UUID archived = studentAt("Archived", 33.931);
		assertEquals(200, send(put("/api/head-of-transport/students/" + archived + "/status").with(head())
				.contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"inactive\"}")).getStatus());
		UUID noPin = studentWithNoPin("Nopin");

		for (UUID refused : List.of(onRoute, paused, archived, noPin)) {
			assertEquals(409, best(refused).getStatus(), refused.toString());
			assertEquals(409, place(refused).getStatus(), refused.toString());
		}
		assertTrue(((String) read(best(noPin).getContentAsString(), "$.detail")).contains("pin"));
		assertTrue(((String) read(best(onRoute).getContentAsString(), "$.detail")).contains("already on a route"));

		schoolSettingsRepository.deleteById(school);
		UUID fresh = studentAt("Fresh", 33.935);
		MockHttpServletResponse noArrival = best(fresh);
		assertEquals(409, noArrival.getStatus(), noArrival.getContentAsString());
		assertTrue(((String) read(noArrival.getContentAsString(), "$.detail")).contains("arrival time"));
	}

	@Test
	void aPausedStudentWhoIsResumedCanBePlacedAgain() throws Exception {
		Bus alpha = route("Alpha", 14);
		UUID rami = studentAt("Rami", 33.936);
		assertEquals(201, place(rami).getStatus());
		assertEquals(200, send(put("/api/head-of-transport/students/" + rami + "/status").with(head())
				.contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"paused\"}")).getStatus());
		assertEquals(List.of(), stopIds(alpha));
		assertEquals(409, place(rami).getStatus(), "paused");

		assertEquals(200, send(put("/api/head-of-transport/students/" + rami + "/status").with(head())
				.contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"active\"}")).getStatus());

		assertEquals(201, place(rami).getStatus());
		assertEquals(List.of(rami.toString()), stopIds(alpha));
	}

	// ---------------------------------------------------------------- whose routes

	@Test
	void anotherSchoolsRoutesAreNeverConsideredAndAnotherSchoolsHeadSeesNothing() throws Exception {
		UUID otherSchool = UUID.randomUUID();
		Vehicle vehicle = vehicleRepository.save(Vehicle.builder().schoolId(otherSchool).plateNumber("C 777777")
				.capacity(14).active(true).build());
		Driver driver = driverRepository.save(Driver.builder().schoolId(otherSchool).firstName("Walid").lastName("Saad")
				.phone("+961 3 777777").email(UUID.randomUUID() + "@wassel.test").status(DriverStatus.ACTIVE)
				.invitedAt(Instant.now()).build());
		Route foreign = routeRepository.save(Route.builder().schoolId(otherSchool).name("Foreign")
				.vehicleId(vehicle.getId()).driverId(driver.getId()).build());
		Bus ours = route("Ours", 14);
		UUID rami = studentAt("Rami", 33.936);

		String answer = ranked(rami);

		assertEquals(List.of(ours.routeId()), read(answer, "$.options[*].routeId"));
		assertTrue(!answer.contains(foreign.getId().toString()), "another school's route is not even named");
		MockHttpServletResponse elsewhere = send(get("/api/head-of-transport/students/" + rami + "/best-route")
				.with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), otherSchool)));
		assertEquals(404, elsewhere.getStatus(), "their student does not exist for another school's head");
		assertEquals(404, send(post("/api/head-of-transport/students/" + rami + "/best-route")
				.with(as(Role.HEAD_OF_TRANSPORT, UUID.randomUUID(), otherSchool))).getStatus());
		assertEquals(404, send(get("/api/head-of-transport/students/" + UUID.randomUUID() + "/best-route").with(head()))
				.getStatus());
		assertEquals(List.of(), stopIds(ours), "none of that placed anybody");
	}

	@Test
	void onlyTheHeadOfTransportationMayAskOrPlace() throws Exception {
		route("Alpha", 14);
		UUID rami = studentAt("Rami", 33.936);
		String url = "/api/head-of-transport/students/" + rami + "/best-route";

		for (Role role : List.of(Role.ADMIN, Role.DRIVER, Role.PARENT)) {
			assertEquals(403, send(get(url).with(as(role, UUID.randomUUID()))).getStatus(), role + " get");
			assertEquals(403, send(post(url).with(as(role, UUID.randomUUID()))).getStatus(), role + " post");
		}
		assertEquals(401, send(get(url)).getStatus());
		assertEquals(401, send(post(url)).getStatus());
		assertEquals(200, best(rami).getStatus());
	}

	// ---------------------------------------------------------------- the samples

	@Test
	void theContractsSamplesHaveTheFieldsOfTheRealAnswers() throws Exception {
		UUID far = studentAt("Far", 33.956);
		UUID near = studentAt("Near", 33.916);
		route("Alpha", 14, far, near);
		UUID c = studentAt("C", 33.966);
		route("Full", 1, c);
		UUID rami = studentAt("Rami", 33.936);
		String answer = ranked(rami);

		String sample = Files.readString(Path.of("../docs/contracts/samples/roster/best-route.json"));
		for (String path : List.of("$", "$.recommended", "$.options[0]", "$.skipped[0]")) {
			assertEquals(keys(sample, path), keys(answer, path), "best-route.json " + path);
		}
		assertEquals(List.of("FULL"), read(answer, "$.skipped[*].reason"));
	}

	@Test
	void theSampleOfAnAnswerWithNoOptionHasTheFieldsOfTheRealOne() throws Exception {
		UUID c = studentAt("C", 33.966);
		route("Full", 1, c);
		String none = ranked(studentAt("Rami", 33.936));

		String sample = Files.readString(Path.of("../docs/contracts/samples/roster/best-route-none.json"));
		assertEquals(keys(sample, "$"), keys(none, "$"));
		assertEquals(keys(sample, "$.skipped[0]"), keys(none, "$.skipped[0]"));
		assertNull(read(sample, "$.recommended"));
		assertNull(read(none, "$.recommended"));
		assertEquals(List.of(), read(sample, "$.options"));
	}

	@SuppressWarnings("unchecked")
	private static Set<String> keys(String json, String path) {
		return new TreeSet<>(((Map<String, Object>) read(json, path)).keySet());
	}
}
