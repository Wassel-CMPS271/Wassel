package com.wassel.backend.routes.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.repository.RouteProposalRepository;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.routes.repository.RouteVersionRepository;
import com.wassel.backend.schools.entity.SchoolSettings;
import com.wassel.backend.schools.repository.SchoolSettingsRepository;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.vehicles.entity.Vehicle;
import com.wassel.backend.vehicles.repository.VehicleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-205: independent tests for the route API (SCRUM-208), student assignment (SCRUM-209),
 * manual reorder (SCRUM-210) and arrival times (SCRUM-212). Written from
 * docs/contracts/routing.md and the ticket, not from the implementation, and only for behaviour
 * {@code RouteControllerTests} does not already check. Everything is real: repositories, services
 * and the H2 schema. The test profile blanks the road provider's key, so every leg is the
 * contract's straight-line fallback (30 km/h, each leg rounded up to whole minutes).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RouteContractTests {

	private static final String URL = "/api/head-of-transport/routes";

	// The Hamra morning run from docs/contracts/samples/routing/proposal.json; the school is at
	// (33.896, 35.484). In this order, with the school arriving at 07:30, the contract sample gives
	// 07:08, 07:15, 07:21, 07:28 (22 minutes of driving, last leg DANA -> school is 2 minutes).
	private static final double[] RAMI = { 33.8995, 35.521 };
	private static final double[] SALMA = { 33.887, 35.488 };
	private static final double[] TAREK = { 33.905, 35.51 };
	private static final double[] DANA = { 33.891, 35.48 };

	private final UUID schoolA = UUID.randomUUID();

	private final UUID schoolB = UUID.randomUUID();

	private final AtomicInteger counter = new AtomicInteger();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private RouteRepository routeRepository;

	@Autowired
	private RouteProposalRepository proposalRepository;

	@Autowired
	private RouteVersionRepository versionRepository;

	@Autowired
	private VehicleRepository vehicleRepository;

	@Autowired
	private DriverRepository driverRepository;

	@Autowired
	private StudentRepository studentRepository;

	@Autowired
	private SchoolSettingsRepository schoolSettingsRepository;

	@BeforeEach
	void cleanDatabase() {
		proposalRepository.deleteAll();
		versionRepository.deleteAll();
		routeRepository.deleteAll();
		driverRepository.deleteAll();
		vehicleRepository.deleteAll();
		studentRepository.deleteAll();
		schoolSettingsRepository.deleteAll();
	}

	// ---- helpers -----------------------------------------------------------------------------

	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private RequestPostProcessor head(UUID schoolId) {
		return loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId);
	}

	private UUID aVehicle(UUID schoolId, boolean active, int capacity) {
		return vehicleRepository.save(Vehicle.builder().schoolId(schoolId)
				.plateNumber("T " + (100000 + counter.incrementAndGet())).capacity(capacity).active(active)
				.build()).getId();
	}

	private UUID aVehicle(UUID schoolId) {
		return aVehicle(schoolId, true, 14);
	}

	private UUID aDriver(UUID schoolId) {
		return driverRepository.save(Driver.builder().schoolId(schoolId).firstName("Walid").lastName("Barakat")
				.phone("0" + (10000000 + counter.incrementAndGet())).email(UUID.randomUUID() + "@wassel.test")
				.status(DriverStatus.ACTIVE).invitedAt(Instant.now()).build()).getId();
	}

	private UUID aStudentAt(UUID schoolId, StudentStatus status, double latitude, double longitude) {
		return studentRepository.save(Student.builder().schoolId(schoolId).firstName("Hadi").lastName("Rizk")
				.grade("5").guardianName("Guardian Name").guardianPhone("0" + (10000000 + counter.incrementAndGet()))
				.status(status).address("Verdun Street, Beirut").latitude(BigDecimal.valueOf(latitude))
				.longitude(BigDecimal.valueOf(longitude)).build()).getId();
	}

	private UUID aStudent(UUID schoolId) {
		return aStudentAt(schoolId, StudentStatus.ACTIVE, 33.886, 35.485);
	}

	private UUID aStudentAt(UUID schoolId, double[] pin) {
		return aStudentAt(schoolId, StudentStatus.ACTIVE, pin[0], pin[1]);
	}

	private UUID anUnpinnedStudent(UUID schoolId) {
		return studentRepository.save(Student.builder().schoolId(schoolId).firstName("Hadi").lastName("Rizk")
				.grade("5").guardianName("Guardian Name").guardianPhone("0" + (10000000 + counter.incrementAndGet()))
				.status(StudentStatus.ACTIVE).build()).getId();
	}

	private void setSchoolArrival(UUID schoolId, LocalTime arrival) {
		schoolSettingsRepository.deleteAll();
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(schoolId).arrivalTime(arrival).build());
	}

	private static String body(String name, UUID vehicleId, UUID driverId) {
		return "{\"name\":\"%s\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}".formatted(name, vehicleId, driverId);
	}

	private String createRoute(UUID schoolId, String name, UUID vehicleId, UUID driverId) throws Exception {
		String response = mockMvc.perform(post(URL).with(head(schoolId)).contentType(MediaType.APPLICATION_JSON)
						.content(body(name, vehicleId, driverId)))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(response, "$.id");
	}

	private String aRoute(UUID schoolId, String name, int capacity) throws Exception {
		return createRoute(schoolId, name, aVehicle(schoolId, true, capacity), aDriver(schoolId));
	}

	private ResultActions create(UUID schoolId, String name, UUID vehicleId, UUID driverId) throws Exception {
		return mockMvc.perform(post(URL).with(head(schoolId)).contentType(MediaType.APPLICATION_JSON)
				.content(body(name, vehicleId, driverId)));
	}

	private ResultActions edit(UUID schoolId, String routeId, String json) throws Exception {
		return mockMvc.perform(put(URL + "/" + routeId).with(head(schoolId)).contentType(MediaType.APPLICATION_JSON)
				.content(json));
	}

	private ResultActions assign(UUID schoolId, String routeId, UUID studentId) throws Exception {
		return mockMvc.perform(post(URL + "/" + routeId + "/students").with(head(schoolId))
				.contentType(MediaType.APPLICATION_JSON).content("{\"studentId\":\"%s\"}".formatted(studentId)));
	}

	private ResultActions remove(UUID schoolId, String routeId, UUID studentId) throws Exception {
		return mockMvc.perform(delete(URL + "/" + routeId + "/students/" + studentId).with(head(schoolId)));
	}

	private ResultActions reorder(UUID schoolId, String routeId, String json) throws Exception {
		return mockMvc.perform(put(URL + "/" + routeId + "/stops").with(head(schoolId))
				.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private ResultActions getRoute(UUID schoolId, String routeId) throws Exception {
		return mockMvc.perform(get(URL + "/" + routeId).with(head(schoolId)));
	}

	private void assignAll(UUID schoolId, String routeId, UUID... studentIds) throws Exception {
		for (UUID studentId : studentIds) {
			assign(schoolId, routeId, studentId).andExpect(status().isOk());
		}
	}

	// ---- SCRUM-208: route API gaps -----------------------------------------------------------

	@Test
	void editingToADriverAlreadyOnAnotherRouteNamesThatRoute() throws Exception {
		UUID takenDriver = aDriver(schoolA);
		createRoute(schoolA, "Verdun morning run", aVehicle(schoolA), takenDriver);
		UUID vehicle = aVehicle(schoolA);
		String id = createRoute(schoolA, "Hamra morning run", vehicle, aDriver(schoolA));

		edit(schoolA, id, body("Hamra morning run", vehicle, takenDriver))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.driverId").value(containsString("Verdun morning run")));
	}

	@Test
	void editingToAnInactiveVehicleIsRejected() throws Exception {
		UUID driver = aDriver(schoolA);
		String id = createRoute(schoolA, "Verdun morning run", aVehicle(schoolA), driver);

		edit(schoolA, id, body("Verdun morning run", aVehicle(schoolA, false, 14), driver))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.vehicleId").isNotEmpty());
	}

	@Test
	void editingWithUnknownOrOtherSchoolReferencesIsNotFoundAndChangesNothing() throws Exception {
		UUID vehicle = aVehicle(schoolA);
		UUID driver = aDriver(schoolA);
		String id = createRoute(schoolA, "Verdun morning run", vehicle, driver);

		edit(schoolA, id, body("Renamed", UUID.randomUUID(), driver)).andExpect(status().isNotFound());
		edit(schoolA, id, body("Renamed", vehicle, UUID.randomUUID())).andExpect(status().isNotFound());
		edit(schoolA, id, body("Renamed", aVehicle(schoolB), driver)).andExpect(status().isNotFound());
		edit(schoolB, id, body("Renamed", aVehicle(schoolB), aDriver(schoolB))).andExpect(status().isNotFound());

		getRoute(schoolA, id).andExpect(jsonPath("$.name").value("Verdun morning run"));
	}

	@Test
	void editingWithAnEmptyBodyOrABlankNameIsAValidationError() throws Exception {
		UUID vehicle = aVehicle(schoolA);
		UUID driver = aDriver(schoolA);
		String id = createRoute(schoolA, "Verdun morning run", vehicle, driver);

		edit(schoolA, id, "{}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.name").isNotEmpty())
				.andExpect(jsonPath("$.errors.vehicleId").isNotEmpty())
				.andExpect(jsonPath("$.errors.driverId").isNotEmpty());
		edit(schoolA, id, body("   ", vehicle, driver)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.name").isNotEmpty());

		getRoute(schoolA, id).andExpect(jsonPath("$.name").value("Verdun morning run"));
	}

	@Test
	void deletingARouteFreesItsVehicleAndDriverForANewRoute() throws Exception {
		UUID vehicle = aVehicle(schoolA);
		UUID driver = aDriver(schoolA);
		String id = createRoute(schoolA, "Verdun morning run", vehicle, driver);

		mockMvc.perform(delete(URL + "/" + id).with(head(schoolA))).andExpect(status().isNoContent());

		create(schoolA, "Hamra morning run", vehicle, driver).andExpect(status().isCreated());
	}

	@Test
	void swappingARoutesVehicleFreesTheOldOneForAnotherRoute() throws Exception {
		UUID oldVehicle = aVehicle(schoolA);
		UUID driver = aDriver(schoolA);
		String id = createRoute(schoolA, "Verdun morning run", oldVehicle, driver);
		edit(schoolA, id, body("Verdun morning run", aVehicle(schoolA), driver)).andExpect(status().isOk());

		create(schoolA, "Hamra morning run", oldVehicle, aDriver(schoolA)).andExpect(status().isCreated());
	}

	@Test
	void everyRouteEndpointRefusesOtherRolesAndAnonymousCallers() throws Exception {
		UUID route = UUID.randomUUID();
		UUID other = UUID.randomUUID();
		String routeBody = body("x", other, other);
		// Suppliers, because a request builder keeps every .with(...) applied to it.
		List<Supplier<MockHttpServletRequestBuilder>> requests = List.of(
				() -> get(URL),
				() -> post(URL).contentType(MediaType.APPLICATION_JSON).content(routeBody),
				() -> get(URL + "/" + route),
				() -> put(URL + "/" + route).contentType(MediaType.APPLICATION_JSON).content(routeBody),
				() -> delete(URL + "/" + route),
				() -> post(URL + "/" + route + "/students").contentType(MediaType.APPLICATION_JSON)
						.content("{\"studentId\":\"%s\"}".formatted(other)),
				() -> delete(URL + "/" + route + "/students/" + other),
				() -> put(URL + "/" + route + "/stops").contentType(MediaType.APPLICATION_JSON)
						.content("{\"studentIds\":[]}"));

		for (Supplier<MockHttpServletRequestBuilder> request : requests) {
			for (Role role : new Role[] { Role.ADMIN, Role.DRIVER, Role.PARENT }) {
				mockMvc.perform(request.get().with(loggedInAs(role, schoolA)))
						.andExpect(status().isForbidden());
			}
			mockMvc.perform(request.get()).andExpect(status().isUnauthorized());
		}
	}

	// ---- SCRUM-209: assigning and removing students ------------------------------------------

	@Test
	void aFullRouteReportsCapacityEvenWhenTheNewStudentIsAlsoInactive() throws Exception {
		String id = aRoute(schoolA, "Verdun morning run", 1);
		assignAll(schoolA, id, aStudent(schoolA));

		assign(schoolA, id, aStudentAt(schoolA, StudentStatus.INACTIVE, 33.886, 35.485))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(containsString("1")))
				.andExpect(jsonPath("$.errors").doesNotExist());
	}

	@Test
	void anUnknownRouteIsNotFoundBeforeTheStudentIsLookedAt() throws Exception {
		assign(schoolA, UUID.randomUUID().toString(), UUID.randomUUID()).andExpect(status().isNotFound());
	}

	@Test
	void aStudentRefusedByAFullRouteStaysOnTheirOldRoute() throws Exception {
		String oldRoute = aRoute(schoolA, "Verdun morning run", 14);
		String fullRoute = aRoute(schoolA, "Hamra morning run", 1);
		UUID student = aStudent(schoolA);
		assignAll(schoolA, oldRoute, student);
		assignAll(schoolA, fullRoute, aStudent(schoolA));

		assign(schoolA, fullRoute, student).andExpect(status().isConflict());

		getRoute(schoolA, oldRoute).andExpect(jsonPath("$.studentCount").value(1))
				.andExpect(jsonPath("$.stops[0].studentId").value(student.toString()));
		getRoute(schoolA, fullRoute).andExpect(jsonPath("$.studentCount").value(1));
	}

	@Test
	void aMovedStudentBecomesTheNewRoutesLastStop() throws Exception {
		String oldRoute = aRoute(schoolA, "Verdun morning run", 14);
		String newRoute = aRoute(schoolA, "Hamra morning run", 14);
		UUID resident = aStudent(schoolA);
		UUID mover = aStudent(schoolA);
		assignAll(schoolA, newRoute, resident);
		assignAll(schoolA, oldRoute, mover);

		assign(schoolA, newRoute, mover).andExpect(status().isOk())
				.andExpect(jsonPath("$.stops[0].studentId").value(resident.toString()))
				.andExpect(jsonPath("$.stops[1].studentId").value(mover.toString()))
				.andExpect(jsonPath("$.stops[1].position").value(2));
	}

	@Test
	void aStudentMadeInactiveAfterBeingAssignedCanStillBeRemoved() throws Exception {
		String id = aRoute(schoolA, "Verdun morning run", 14);
		UUID studentId = aStudent(schoolA);
		assignAll(schoolA, id, studentId);
		Student student = studentRepository.findById(studentId).orElseThrow();
		student.setStatus(StudentStatus.INACTIVE);
		studentRepository.save(student);

		remove(schoolA, id, studentId).andExpect(status().isOk()).andExpect(jsonPath("$.studentCount").value(0));
	}

	@Test
	void anotherSchoolCannotAddToOrRemoveFromThisSchoolsRoute() throws Exception {
		String id = aRoute(schoolA, "Verdun morning run", 14);
		UUID mine = aStudent(schoolA);
		assignAll(schoolA, id, mine);

		assign(schoolB, id, aStudent(schoolB)).andExpect(status().isNotFound());
		remove(schoolB, id, mine).andExpect(status().isNotFound());
		// Own route, but the student belongs to the other school.
		remove(schoolA, id, aStudent(schoolB)).andExpect(status().isNotFound());

		getRoute(schoolA, id).andExpect(jsonPath("$.studentCount").value(1))
				.andExpect(jsonPath("$.stops[0].studentId").value(mine.toString()));
	}

	@Test
	void removingAMiddleStopKeepsTheOrderAndTheNextStudentGoesLast() throws Exception {
		String id = aRoute(schoolA, "Verdun morning run", 14);
		UUID first = aStudent(schoolA);
		UUID middle = aStudent(schoolA);
		UUID last = aStudent(schoolA);
		assignAll(schoolA, id, first, middle, last);

		remove(schoolA, id, middle).andExpect(status().isOk())
				.andExpect(jsonPath("$.stops.length()").value(2))
				.andExpect(jsonPath("$.stops[0].studentId").value(first.toString()))
				.andExpect(jsonPath("$.stops[0].position").value(1))
				.andExpect(jsonPath("$.stops[1].studentId").value(last.toString()))
				.andExpect(jsonPath("$.stops[1].position").value(2));

		UUID newcomer = aStudent(schoolA);
		assign(schoolA, id, newcomer).andExpect(status().isOk())
				.andExpect(jsonPath("$.stops[2].studentId").value(newcomer.toString()))
				.andExpect(jsonPath("$.stops[2].position").value(3));
	}

	@Test
	void assigningAndRemovingNeverWriteTheOldRouteTextColumn() throws Exception {
		String id = aRoute(schoolA, "Verdun morning run", 14);
		UUID studentId = aStudent(schoolA);
		Student student = studentRepository.findById(studentId).orElseThrow();
		student.setRoute("Bus 7");
		studentRepository.save(student);

		assign(schoolA, id, studentId).andExpect(status().isOk());
		assertEquals("Bus 7", studentRepository.findById(studentId).orElseThrow().getRoute());
		remove(schoolA, id, studentId).andExpect(status().isOk());
		assertEquals("Bus 7", studentRepository.findById(studentId).orElseThrow().getRoute());
	}

	@Test
	void aMissingOrMalformedStudentIdIsABadRequest() throws Exception {
		String id = aRoute(schoolA, "Verdun morning run", 14);

		mockMvc.perform(post(URL + "/" + id + "/students").with(head(schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.studentId").isNotEmpty());
		mockMvc.perform(post(URL + "/" + id + "/students").with(head(schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{\"studentId\":\"not-a-uuid\"}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void aRouteOverCapacityShowsNegativeSeatsLeftAndRefusesAnotherStudent() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true, 3);
		String id = createRoute(schoolA, "Verdun morning run", vehicleId, aDriver(schoolA));
		assignAll(schoolA, id, aStudent(schoolA), aStudent(schoolA), aStudent(schoolA));
		Vehicle vehicle = vehicleRepository.findById(vehicleId).orElseThrow();
		vehicle.setCapacity(1);
		vehicleRepository.save(vehicle);

		getRoute(schoolA, id).andExpect(jsonPath("$.seatsLeft").value(-2));
		mockMvc.perform(get(URL).with(head(schoolA))).andExpect(jsonPath("$[0].seatsLeft").value(-2));
		assign(schoolA, id, aStudent(schoolA)).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(allOf(containsString("3"), containsString("1"))));
	}

	// Findings A (re-adding a student) and B (renaming after a deactivation) are covered, with
	// their fixes, by RouteReAddAndRenameTests.

	// ---- SCRUM-210: manual reorder -----------------------------------------------------------

	@Test
	void aNullOrEmptyOrderIsRejectedAndLeavesTheRouteAsItWas() throws Exception {
		String id = aRoute(schoolA, "Verdun morning run", 14);
		UUID first = aStudent(schoolA);
		UUID second = aStudent(schoolA);
		assignAll(schoolA, id, first, second);

		reorder(schoolA, id, "{\"studentIds\":null}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.studentIds").isNotEmpty());
		reorder(schoolA, id, "{}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.studentIds").isNotEmpty());
		reorder(schoolA, id, "{\"studentIds\":[]}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.studentIds").isNotEmpty());

		getRoute(schoolA, id).andExpect(jsonPath("$.stops[0].studentId").value(first.toString()))
				.andExpect(jsonPath("$.stops[1].studentId").value(second.toString()));
	}

	// ---- SCRUM-212: arrival times ------------------------------------------------------------

	/** The four sample stops in the sample's order, with the given school arrival time. */
	private String hamraRoute(LocalTime schoolArrival) throws Exception {
		String id = aRoute(schoolA, "Hamra morning run", 14);
		setSchoolArrival(schoolA, schoolArrival);
		assignAll(schoolA, id, aStudentAt(schoolA, RAMI), aStudentAt(schoolA, SALMA), aStudentAt(schoolA, TAREK),
				aStudentAt(schoolA, DANA));
		return id;
	}

	@Test
	void aFirstPickupExactlyAtSixIsAllowedAndOneMinuteEarlierGivesNoTimes() throws Exception {
		// 22 minutes of driving: a 06:22 arrival starts at exactly 06:00, a 06:21 arrival at 05:59.
		String id = hamraRoute(LocalTime.of(6, 22));
		getRoute(schoolA, id)
				.andExpect(jsonPath("$.stops[0].arrivalTime").value("06:00"))
				.andExpect(jsonPath("$.stops[1].arrivalTime").value("06:07"))
				.andExpect(jsonPath("$.stops[2].arrivalTime").value("06:13"))
				.andExpect(jsonPath("$.stops[3].arrivalTime").value("06:20"));

		setSchoolArrival(schoolA, LocalTime.of(6, 21));
		getRoute(schoolA, id)
				.andExpect(jsonPath("$.stops[0].arrivalTime").isEmpty())
				.andExpect(jsonPath("$.stops[3].arrivalTime").isEmpty());
	}

	@Test
	void aScheduleThatWouldStartBeforeMidnightGivesNoTimesNotAnError() throws Exception {
		String id = hamraRoute(LocalTime.of(0, 10));

		getRoute(schoolA, id).andExpect(status().isOk())
				.andExpect(jsonPath("$.stops.length()").value(4))
				.andExpect(jsonPath("$.stops[0].arrivalTime").isEmpty())
				.andExpect(jsonPath("$.stops[3].arrivalTime").isEmpty());
	}

	@Test
	void anUnpinnedStopInTheMiddleIsSkippedByTheLegsAround() throws Exception {
		String id = aRoute(schoolA, "Hamra morning run", 14);
		setSchoolArrival(schoolA, LocalTime.of(7, 30));
		assignAll(schoolA, id, aStudentAt(schoolA, RAMI), aStudentAt(schoolA, SALMA), anUnpinnedStudent(schoolA),
				aStudentAt(schoolA, TAREK), aStudentAt(schoolA, DANA));

		getRoute(schoolA, id)
				.andExpect(jsonPath("$.stops[0].arrivalTime").value("07:08"))
				.andExpect(jsonPath("$.stops[1].arrivalTime").value("07:15"))
				.andExpect(jsonPath("$.stops[2].arrivalTime").isEmpty())
				.andExpect(jsonPath("$.stops[3].arrivalTime").value("07:21"))
				.andExpect(jsonPath("$.stops[4].arrivalTime").value("07:28"));
	}

	@Test
	void removingAStopRecalculatesTheRemainingTimesInTheResponse() throws Exception {
		String id = aRoute(schoolA, "Hamra morning run", 14);
		setSchoolArrival(schoolA, LocalTime.of(7, 30));
		UUID tarek = aStudentAt(schoolA, TAREK);
		assignAll(schoolA, id, aStudentAt(schoolA, RAMI), aStudentAt(schoolA, SALMA), tarek,
				aStudentAt(schoolA, DANA));

		// Without TAREK the legs are RAMI -> SALMA 7 (from the sample), SALMA -> DANA 2
		// (0.86 km at 30 km/h = 1.7 min, rounded up), DANA -> school 2 (DANA arrives 07:28).
		remove(schoolA, id, tarek).andExpect(status().isOk())
				.andExpect(jsonPath("$.stops[0].arrivalTime").value("07:19"))
				.andExpect(jsonPath("$.stops[1].arrivalTime").value("07:26"))
				.andExpect(jsonPath("$.stops[2].arrivalTime").value("07:28"));
	}
}
