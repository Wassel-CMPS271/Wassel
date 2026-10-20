package com.wassel.backend.routes.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.entity.FleetProposalRoute;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.FleetProposalRepository;
import com.wassel.backend.routes.repository.FleetProposalRouteRepository;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Generate, apply and discard for the whole school (SCRUM-207), on the real solver and real
 * repositories. The solver's search is time-limited, so these assert the rules every answer must
 * keep, never one exact split. Seats are set equal to the students wherever a test needs every
 * vehicle to be used.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RouteGenerationControllerTests {

	private static final String URL = "/api/head-of-transport/routes";

	private static final String GENERATION = URL + "/generation";

	private final UUID schoolA = UUID.randomUUID();

	private final UUID schoolB = UUID.randomUUID();

	private int pinCounter;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private RouteRepository routeRepository;

	@Autowired
	private RouteProposalRepository proposalRepository;

	@Autowired
	private RouteVersionRepository versionRepository;

	@Autowired
	private FleetProposalRepository fleetProposalRepository;

	@Autowired
	private FleetProposalRouteRepository fleetProposalRouteRepository;

	@Autowired
	private VehicleRepository vehicleRepository;

	@Autowired
	private DriverRepository driverRepository;

	@Autowired
	private StudentRepository studentRepository;

	@Autowired
	private SchoolSettingsRepository schoolSettingsRepository;

	/** A vehicle and the driver assigned to it. */
	private record Ready(UUID vehicleId, UUID driverId) {
	}

	@BeforeEach
	void cleanDatabase() {
		fleetProposalRouteRepository.deleteAll();
		fleetProposalRepository.deleteAll();
		proposalRepository.deleteAll();
		versionRepository.deleteAll();
		routeRepository.deleteAll();
		driverRepository.deleteAll();
		vehicleRepository.deleteAll();
		studentRepository.deleteAll();
		schoolSettingsRepository.deleteAll();
		pinCounter = 0;
	}

	// ---------------------------------------------------------------- helpers

	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private UUID vehicle(UUID schoolId, int capacity, String plate, boolean active) {
		return vehicleRepository.save(Vehicle.builder().schoolId(schoolId).plateNumber(plate).capacity(capacity)
				.active(active).build()).getId();
	}

	private UUID driver(UUID schoolId, UUID assignedVehicleId, DriverStatus status) {
		return driverRepository.save(Driver.builder().schoolId(schoolId).firstName("Walid").lastName("Barakat")
				.phone("0" + (int) (Math.random() * 100000000)).email(UUID.randomUUID() + "@wassel.test")
				.status(status).invitedAt(Instant.now()).assignedVehicleId(assignedVehicleId).build()).getId();
	}

	private Ready ready(UUID schoolId, int capacity, String plate) {
		UUID vehicleId = vehicle(schoolId, capacity, plate, true);
		return new Ready(vehicleId, driver(schoolId, vehicleId, DriverStatus.ACTIVE));
	}

	/** A pinned student a few hundred metres from the previous one, so every route is easily drivable. */
	private UUID pinned(UUID schoolId) {
		int i = pinCounter++;
		return student(schoolId, "Student" + i, StudentStatus.ACTIVE, 33.880 + i * 0.003, 35.490 + i * 0.002);
	}

	private UUID student(UUID schoolId, String firstName, StudentStatus status, Double latitude, Double longitude) {
		return studentRepository.save(Student.builder().schoolId(schoolId).firstName(firstName).lastName("Rizk")
				.grade("5").guardianName("Guardian Name").guardianPhone("0" + (int) (Math.random() * 100000000))
				.status(status).address("Verdun Street, Beirut")
				.latitude(latitude == null ? null : BigDecimal.valueOf(latitude))
				.longitude(longitude == null ? null : BigDecimal.valueOf(longitude)).build()).getId();
	}

	private UUID unpinned(UUID schoolId) {
		return student(schoolId, "NoPin", StudentStatus.ACTIVE, null, null);
	}

	/** A route already saved, with these students on it in this order. */
	private UUID routeWith(UUID schoolId, String name, Ready ready, UUID... studentIds) {
		UUID routeId = routeRepository.save(Route.builder().schoolId(schoolId).name(name)
				.vehicleId(ready.vehicleId()).driverId(ready.driverId()).build()).getId();
		int position = 1;
		for (UUID studentId : studentIds) {
			Student student = studentRepository.findById(studentId).orElseThrow();
			student.setRouteId(routeId);
			student.setStopPosition(position++);
			studentRepository.save(student);
		}
		return routeId;
	}

	private void setSchoolArrivalTime(UUID schoolId, LocalTime arrivalTime) {
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(schoolId).arrivalTime(arrivalTime).build());
	}

	private ResultActions generateAs(UUID schoolId) throws Exception {
		return mockMvc.perform(post(GENERATION).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId)));
	}

	private ResultActions applyAs(UUID schoolId, Object proposalId) throws Exception {
		return mockMvc.perform(post(GENERATION + "/" + proposalId + "/apply")
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId)));
	}

	private ResultActions discardAs(UUID schoolId, Object proposalId) throws Exception {
		return mockMvc.perform(delete(GENERATION + "/" + proposalId)
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId)));
	}

	private String generated(UUID schoolId) throws Exception {
		return generateAs(schoolId).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
	}

	private String idOf(String proposalJson) {
		return JsonPath.read(proposalJson, "$.id");
	}

	private List<String> strings(String json, String path) {
		return JsonPath.read(json, path);
	}

	private List<String> asStrings(UUID... ids) {
		return java.util.Arrays.stream(ids).map(UUID::toString).toList();
	}

	private Student studentNow(UUID id) {
		return studentRepository.findById(id).orElseThrow();
	}

	private List<String> stopIdsOf(UUID schoolId, Object routeId) throws Exception {
		String body = mockMvc.perform(get(URL + "/" + routeId).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId)))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.stops[*].studentId");
	}

	/** Four students, two vehicles of two seats each, arrival 07:30: both vehicles are needed. */
	private List<UUID> fullFleetOfFour(List<Ready> vehicles) {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		vehicles.add(ready(schoolA, 2, "V 1"));
		vehicles.add(ready(schoolA, 2, "V 2"));
		List<UUID> students = new ArrayList<>();
		for (int i = 0; i < 4; i++) {
			students.add(pinned(schoolA));
		}
		return students;
	}

	// ------------------------------------------------------------- generating

	@Test
	void generatingProposesRoutesAndChangesNothing() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		List<UUID> students = fullFleetOfFour(vehicles);

		String body = generated(schoolA);

		assertNotNull(idOf(body));
		assertEquals(2, ((List<?>) JsonPath.read(body, "$.routes")).size());
		assertEquals(0, routeRepository.count());
		for (UUID id : students) {
			assertNull(studentNow(id).getRouteId());
		}
		assertEquals(1, fleetProposalRepository.count());
	}

	@Test
	void everyActivePinnedStudentIsOnExactlyOneRouteOrUnplacedAndNoVehicleIsOverCapacity() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		ready(schoolA, 3, "V 1");
		ready(schoolA, 3, "V 2");
		ready(schoolA, 3, "V 3");
		List<UUID> students = new ArrayList<>();
		for (int i = 0; i < 8; i++) {
			students.add(pinned(schoolA));
		}

		String body = generated(schoolA);

		List<String> placed = strings(body, "$.routes[*].stops[*].studentId");
		List<String> unplaced = strings(body, "$.unplaced[*].studentId");
		List<String> all = new ArrayList<>(placed);
		all.addAll(unplaced);
		assertEquals(8, all.size());
		assertEquals(new HashSet<>(asStrings(students.toArray(UUID[]::new))), new HashSet<>(all));
		assertTrue(unplaced.isEmpty(), "9 seats for 8 nearby students: everyone fits");
		int routes = ((List<?>) JsonPath.read(body, "$.routes")).size();
		for (int r = 0; r < routes; r++) {
			List<?> stops = JsonPath.read(body, "$.routes[" + r + "].stops");
			int capacity = JsonPath.read(body, "$.routes[" + r + "].vehicle.capacity");
			assertTrue(stops.size() <= capacity);
			String previous = "00:00";
			for (int s = 0; s < stops.size(); s++) {
				int position = JsonPath.read(body, "$.routes[" + r + "].stops[" + s + "].position");
				assertEquals(s + 1, position);
				String arrival = JsonPath.read(body, "$.routes[" + r + "].stops[" + s + "].arrivalTime");
				assertTrue(arrival.compareTo(previous) >= 0, "arrival times never go backwards along a route");
				assertTrue(arrival.compareTo("07:30") <= 0, "no stop is after the school's arrival time");
				previous = arrival;
			}
		}

		applyAs(schoolA, idOf(body)).andExpect(status().isOk());

		for (UUID studentId : students) {
			assertNotNull(studentNow(studentId).getRouteId());
		}
		for (Route route : routeRepository.findBySchoolIdOrderByCreatedAtAsc(schoolA)) {
			int capacity = vehicleRepository.findById(route.getVehicleId()).orElseThrow().getCapacity();
			assertTrue(studentRepository.countBySchoolIdAndRouteId(schoolA, route.getId()) <= capacity);
		}
	}

	@Test
	void notEnoughSeatsReportsTheRestAsCapacityExceededInsteadOfFailing() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		ready(schoolA, 2, "V 1");
		ready(schoolA, 2, "V 2");
		for (int i = 0; i < 6; i++) {
			pinned(schoolA);
		}

		generateAs(schoolA).andExpect(status().isCreated())
				.andExpect(jsonPath("$.routes[0].stops.length()").value(2))
				.andExpect(jsonPath("$.routes[1].stops.length()").value(2))
				.andExpect(jsonPath("$.unplaced.length()").value(2))
				.andExpect(jsonPath("$.unplaced[0].reason.code").value("CAPACITY_EXCEEDED"))
				.andExpect(jsonPath("$.unplaced[0].reason.message").value("There are 6 students but the vehicles seat 4."));
	}

	@Test
	void anActiveStudentWithoutAPinIsUnplacedWithNoPinAndAnInactiveOneIsIgnored() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		ready(schoolA, 2, "V 1");
		UUID a = pinned(schoolA);
		UUID b = pinned(schoolA);
		UUID noPin = unpinned(schoolA);
		UUID inactive = student(schoolA, "Gone", StudentStatus.INACTIVE, 33.89, 35.49);

		String body = generated(schoolA);

		assertEquals(List.of(noPin.toString()), strings(body, "$.unplaced[*].studentId"));
		assertEquals(List.of("NO_PIN"), strings(body, "$.unplaced[*].reason.code"));
		assertEquals(new HashSet<>(asStrings(a, b)), new HashSet<>(strings(body, "$.routes[*].stops[*].studentId")));
		assertFalse(body.contains(inactive.toString()));
	}

	@Test
	void vehiclesNoActiveDriverCanDriveAreExcludedAndNeverPlanned() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		Ready good = ready(schoolA, 4, "GOOD 1");
		UUID noDriver = vehicle(schoolA, 4, "NODRIVER 1", true);
		UUID invited = vehicle(schoolA, 4, "INVITED 1", true);
		driver(schoolA, invited, DriverStatus.INVITED);
		UUID deactivated = vehicle(schoolA, 4, "DEACT 1", true);
		driver(schoolA, deactivated, DriverStatus.DEACTIVATED);
		// The driver assigned to this vehicle is already on a route of another vehicle.
		UUID takenVehicle = vehicle(schoolA, 4, "TAKEN 1", true);
		UUID takenDriver = driver(schoolA, takenVehicle, DriverStatus.ACTIVE);
		UUID otherVehicle = vehicle(schoolA, 4, "OTHER 1", true);
		routeWith(schoolA, "Other run", new Ready(otherVehicle, takenDriver));
		UUID inactiveVehicle = vehicle(schoolA, 4, "INACTIVE 1", false);
		driver(schoolA, inactiveVehicle, DriverStatus.ACTIVE);
		pinned(schoolA);
		pinned(schoolA);

		String body = generated(schoolA);

		Set<String> excluded = new HashSet<>(strings(body, "$.excludedVehicles[*].vehicle.plateNumber"));
		assertEquals(Set.of("NODRIVER 1", "INVITED 1", "DEACT 1", "TAKEN 1"), excluded);
		Set<String> planned = new HashSet<>(strings(body, "$.routes[*].vehicle.id"));
		assertFalse(planned.contains(noDriver.toString()));
		assertFalse(planned.contains(invited.toString()));
		assertFalse(planned.contains(deactivated.toString()));
		assertFalse(planned.contains(takenVehicle.toString()));
		assertFalse(planned.contains(inactiveVehicle.toString()));
		assertTrue(planned.contains(good.vehicleId().toString()) || planned.contains(otherVehicle.toString()));
	}

	@Test
	void generatingBeforeTheSchoolsArrivalTimeIsSetIsAConflict() throws Exception {
		ready(schoolA, 2, "V 1");
		pinned(schoolA);

		generateAs(schoolA).andExpect(status().isConflict());

		assertEquals(0, fleetProposalRepository.count());
	}

	@Test
	void withNothingToPlaceTheIdIsNullAndNothingIsSaved() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		ready(schoolA, 2, "V 1");

		generateAs(schoolA).andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.nullValue()))
				.andExpect(jsonPath("$.routes.length()").value(0))
				.andExpect(jsonPath("$.unplaced.length()").value(0));

		assertEquals(0, fleetProposalRepository.count());
	}

	@Test
	void generatingAgainReplacesThePendingProposal() throws Exception {
		fullFleetOfFour(new ArrayList<>());
		String first = idOf(generated(schoolA));

		String second = idOf(generated(schoolA));

		assertFalse(first.equals(second));
		assertEquals(1, fleetProposalRepository.count());
		applyAs(schoolA, first).andExpect(status().isNotFound());
		applyAs(schoolA, second).andExpect(status().isOk());
	}

	@Test
	void generatingWithNothingToPlaceAlsoDropsThePendingProposal() throws Exception {
		List<UUID> students = fullFleetOfFour(new ArrayList<>());
		String pending = idOf(generated(schoolA));
		for (UUID id : students) {
			Student student = studentNow(id);
			student.setStatus(StudentStatus.INACTIVE);
			studentRepository.save(student);
		}

		generateAs(schoolA).andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.nullValue()));

		assertEquals(0, fleetProposalRepository.count());
		applyAs(schoolA, pending).andExpect(status().isNotFound());
	}

	@Test
	void eachSchoolKeepsItsOwnPendingProposal() throws Exception {
		fullFleetOfFour(new ArrayList<>());
		setSchoolArrivalTime(schoolB, LocalTime.of(7, 30));
		ready(schoolB, 4, "B 1");
		student(schoolB, "Other", StudentStatus.ACTIVE, 33.89, 35.49);
		String mine = idOf(generated(schoolA));

		String theirs = idOf(generated(schoolB));

		assertEquals(2, fleetProposalRepository.count());
		applyAs(schoolA, mine).andExpect(status().isOk());
		applyAs(schoolB, theirs).andExpect(status().isOk());
	}

	// --------------------------------------------------------------- applying

	@Test
	void applyingCreatesTheRoutesAssignsTheStudentsAndSavesTheStopOrder() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		List<UUID> students = fullFleetOfFour(vehicles);
		String proposal = generated(schoolA);

		String body = applyAs(schoolA, idOf(proposal)).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andReturn().getResponse().getContentAsString();

		assertEquals(2, routeRepository.count());
		Set<String> placed = new HashSet<>();
		for (int r = 0; r < 2; r++) {
			String vehicleId = JsonPath.read(proposal, "$.routes[" + r + "].vehicle.id");
			Route route = routeRepository.findBySchoolIdAndVehicleId(schoolA, UUID.fromString(vehicleId)).orElseThrow();
			assertTrue(strings(body, "$[*].id").contains(route.getId().toString()));
			Ready planned = vehicles.stream().filter(v -> v.vehicleId().toString().equals(vehicleId)).findFirst()
					.orElseThrow();
			String plate = vehicleRepository.findById(planned.vehicleId()).orElseThrow().getPlateNumber();
			assertEquals(plate + " morning run", route.getName());
			assertEquals(planned.driverId(), route.getDriverId(), "a new route gets the vehicle's assigned driver");
			List<String> expected = strings(proposal, "$.routes[" + r + "].stops[*].studentId");
			assertEquals(expected, stopIdsOf(schoolA, route.getId()));
			for (int s = 0; s < expected.size(); s++) {
				Student student = studentNow(UUID.fromString(expected.get(s)));
				assertEquals(route.getId(), student.getRouteId());
				assertEquals(s + 1, student.getStopPosition());
			}
			placed.addAll(expected);
		}
		assertEquals(new HashSet<>(asStrings(students.toArray(UUID[]::new))), placed);
		assertEquals(0, fleetProposalRepository.count());
		assertEquals(0, fleetProposalRouteRepository.count());
	}

	@Test
	void aVehicleThatAlreadyHasARouteUpdatesItAndKeepsItsNameAndDriver() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		Ready first = ready(schoolA, 2, "V 1");
		ready(schoolA, 2, "V 2");
		UUID a = pinned(schoolA);
		pinned(schoolA);
		pinned(schoolA);
		pinned(schoolA);
		UUID inactive = student(schoolA, "Gone", StudentStatus.INACTIVE, 33.89, 35.49);
		// The route's own driver is not the vehicle's assigned driver: it must be kept, not swapped.
		UUID routeDriver = driver(schoolA, null, DriverStatus.ACTIVE);
		UUID routeId = routeWith(schoolA, "Old name", new Ready(first.vehicleId(), routeDriver), inactive, a);

		String proposal = generated(schoolA);

		int index = strings(proposal, "$.routes[*].existingRouteId").indexOf(routeId.toString());
		assertTrue(index >= 0, "the route on vehicle 1 is updated, not duplicated");
		assertEquals("Old name", JsonPath.read(proposal, "$.routes[" + index + "].name"));
		assertEquals(routeDriver.toString(), JsonPath.read(proposal, "$.routes[" + index + "].driver.id"));
		assertTrue(strings(proposal, "$.routes[" + index + "].leaving[*].studentId").contains(inactive.toString()));

		applyAs(schoolA, idOf(proposal)).andExpect(status().isOk());

		assertEquals(2, routeRepository.count());
		Route route = routeRepository.findById(routeId).orElseThrow();
		assertEquals("Old name", route.getName());
		assertEquals(routeDriver, route.getDriverId());
		assertEquals(strings(proposal, "$.routes[" + index + "].stops[*].studentId"), stopIdsOf(schoolA, routeId));
		assertNull(studentNow(inactive).getRouteId());
		assertNull(studentNow(inactive).getStopPosition());
	}

	@Test
	void aPlannedVehicleThatGetsNoStudentsIsListedWithNoStopsAndApplyEmptiesItsRoute() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		ready(schoolA, 2, "V 1");
		// No seats: it can be planned, but the solver can never give it a student.
		Ready empty = ready(schoolA, 0, "EMPTY 1");
		UUID rider = pinned(schoolA);
		pinned(schoolA);
		UUID routeId = routeWith(schoolA, "Old run", empty, rider);
		// A route of a planned vehicle that has nobody to lose is not listed: nothing about it changes.
		Ready idle = ready(schoolA, 0, "IDLE 1");
		UUID idleRoute = routeWith(schoolA, "Idle run", idle);

		String proposal = generated(schoolA);

		int index = strings(proposal, "$.routes[*].existingRouteId").indexOf(routeId.toString());
		assertTrue(index >= 0, "the emptied route is in the proposal");
		assertEquals(0, ((List<?>) JsonPath.read(proposal, "$.routes[" + index + "].stops")).size());
		assertEquals(0, (int) JsonPath.read(proposal, "$.routes[" + index + "].drivingMinutes"));
		assertEquals(List.of(rider.toString()), strings(proposal, "$.routes[" + index + "].leaving[*].studentId"));
		assertFalse(strings(proposal, "$.routes[*].existingRouteId").contains(idleRoute.toString()));

		applyAs(schoolA, idOf(proposal)).andExpect(status().isOk());

		assertEquals(0, studentRepository.countBySchoolIdAndRouteId(schoolA, routeId));
		assertEquals("Old run", routeRepository.findById(routeId).orElseThrow().getName());
		UUID now = studentNow(rider).getRouteId();
		assertNotNull(now, "two seats for two students: the rider moves to V 1");
		assertFalse(routeId.equals(now));
	}

	@Test
	void aRouteOfAVehicleThatIsNotPlannedIsLeftAloneButItsStudentsCanBeMovedOffIt() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		ready(schoolA, 2, "V 1");
		ready(schoolA, 2, "V 2");
		UUID leavingVehicle = vehicle(schoolA, 4, "OLD 1", true);
		UUID deactivatedDriver = driver(schoolA, leavingVehicle, DriverStatus.DEACTIVATED);
		UUID moved = pinned(schoolA);
		pinned(schoolA);
		pinned(schoolA);
		pinned(schoolA);
		UUID oldRoute = routeWith(schoolA, "Old run", new Ready(leavingVehicle, deactivatedDriver), moved);

		String proposal = generated(schoolA);
		applyAs(schoolA, idOf(proposal)).andExpect(status().isOk());

		Route route = routeRepository.findById(oldRoute).orElseThrow();
		assertEquals("Old run", route.getName());
		assertEquals(leavingVehicle, route.getVehicleId());
		assertEquals(deactivatedDriver, route.getDriverId());
		UUID movedTo = studentNow(moved).getRouteId();
		assertNotNull(movedTo);
		assertFalse(oldRoute.equals(movedTo));
		assertEquals(3, routeRepository.count());
	}

	@Test
	void applyingTheSameProposalTwiceIsNotFoundAndGeneratingAgainNeverDuplicatesARoute() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		List<UUID> students = fullFleetOfFour(vehicles);
		String id = idOf(generated(schoolA));

		applyAs(schoolA, id).andExpect(status().isOk());
		applyAs(schoolA, id).andExpect(status().isNotFound());
		assertEquals(2, routeRepository.count());

		applyAs(schoolA, idOf(generated(schoolA))).andExpect(status().isOk());

		assertEquals(2, routeRepository.count());
		Set<UUID> routeIds = new HashSet<>();
		for (UUID studentId : students) {
			UUID routeId = studentNow(studentId).getRouteId();
			assertNotNull(routeId);
			routeIds.add(routeId);
		}
		assertEquals(2, routeIds.size());
	}

	// -------------------------------------------------------------- discarding

	@Test
	void discardingDropsTheProposalAndLeavesEverythingElseAlone() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		List<UUID> students = fullFleetOfFour(vehicles);
		UUID existing = routeWith(schoolA, "Old name", vehicles.get(0), students.get(3), students.get(2));
		String id = idOf(generated(schoolA));

		discardAs(schoolA, id).andExpect(status().isNoContent());

		assertEquals(0, fleetProposalRepository.count());
		assertEquals(0, fleetProposalRouteRepository.count());
		assertEquals(1, routeRepository.count());
		assertEquals("Old name", routeRepository.findById(existing).orElseThrow().getName());
		assertEquals(existing, studentNow(students.get(3)).getRouteId());
		assertEquals(1, studentNow(students.get(3)).getStopPosition());
		assertEquals(existing, studentNow(students.get(2)).getRouteId());
		assertEquals(2, studentNow(students.get(2)).getStopPosition());
		assertNull(studentNow(students.get(0)).getRouteId());
		assertNull(studentNow(students.get(1)).getRouteId());
		discardAs(schoolA, id).andExpect(status().isNotFound());
		applyAs(schoolA, id).andExpect(status().isNotFound());
	}

	// --------------------------------------------------- the data moved on since

	/** Asserts apply is refused with a 409 naming the part that changed, and that nothing was written. */
	private void assertRefused(String proposalId, String changed) throws Exception {
		long routes = routeRepository.count();
		applyAs(schoolA, proposalId).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail")
						.value("The " + changed + " changed since these routes were generated. Generate them again."));
		assertEquals(routes, routeRepository.count());
		assertEquals(1, fleetProposalRepository.count());
	}

	@Test
	void applyingAfterAStudentWasDeactivatedIsRefused() throws Exception {
		List<UUID> students = fullFleetOfFour(new ArrayList<>());
		String id = idOf(generated(schoolA));

		Student student = studentNow(students.get(0));
		student.setStatus(StudentStatus.INACTIVE);
		studentRepository.save(student);

		assertRefused(id, "students");
	}

	@Test
	void applyingAfterAPlannedDriverWasDeactivatedIsRefused() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		fullFleetOfFour(vehicles);
		String id = idOf(generated(schoolA));

		Driver driver = driverRepository.findById(vehicles.get(0).driverId()).orElseThrow();
		driver.setStatus(DriverStatus.DEACTIVATED);
		driverRepository.save(driver);

		assertRefused(id, "vehicles");
	}

	@Test
	void applyingAfterARouteWasDeletedIsRefused() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		List<UUID> students = fullFleetOfFour(vehicles);
		UUID routeId = routeWith(schoolA, "Old run", vehicles.get(0), students.get(0));
		String id = idOf(generated(schoolA));

		mockMvc.perform(delete(URL + "/" + routeId).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNoContent());

		applyAs(schoolA, id).andExpect(status().isConflict());
	}

	@Test
	void aRenameOrAnAddressTextEditDoesNotRefuseApply() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		List<UUID> students = fullFleetOfFour(vehicles);
		UUID routeId = routeWith(schoolA, "Old run", vehicles.get(0), students.get(0));
		String id = idOf(generated(schoolA));

		Student student = studentNow(students.get(1));
		student.setFirstName("Renamed");
		student.setAddress("Another street, Beirut");
		studentRepository.save(student);
		Route route = routeRepository.findById(routeId).orElseThrow();
		route.setName("Renamed run");
		routeRepository.save(route);

		applyAs(schoolA, id).andExpect(status().isOk());
		assertEquals("Renamed run", routeRepository.findById(routeId).orElseThrow().getName());
	}

	@Test
	void applyingAfterAStudentWasAddedIsRefused() throws Exception {
		fullFleetOfFour(new ArrayList<>());
		String id = idOf(generated(schoolA));

		pinned(schoolA);

		assertRefused(id, "students");
	}

	@Test
	void applyingAfterAPinWasMovedIsRefused() throws Exception {
		List<UUID> students = fullFleetOfFour(new ArrayList<>());
		String id = idOf(generated(schoolA));

		Student student = studentNow(students.get(0));
		student.setLatitude(BigDecimal.valueOf(33.95));
		studentRepository.save(student);

		assertRefused(id, "students");
	}

	@Test
	void applyingAfterACapacityChangedIsRefused() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		fullFleetOfFour(vehicles);
		String id = idOf(generated(schoolA));

		Vehicle vehicle = vehicleRepository.findById(vehicles.get(0).vehicleId()).orElseThrow();
		vehicle.setCapacity(3);
		vehicleRepository.save(vehicle);

		assertRefused(id, "vehicles");
	}

	@Test
	void applyingAfterTheSchoolsArrivalTimeChangedIsRefused() throws Exception {
		fullFleetOfFour(new ArrayList<>());
		String id = idOf(generated(schoolA));

		setSchoolArrivalTime(schoolA, LocalTime.of(8, 0));

		assertRefused(id, "arrival time");
	}

	@Test
	void applyingAfterARouteWasCreatedByHandIsRefused() throws Exception {
		fullFleetOfFour(new ArrayList<>());
		String id = idOf(generated(schoolA));

		UUID spare = vehicle(schoolA, 4, "SPARE 1", false);
		routeWith(schoolA, "Spare run", new Ready(spare, driver(schoolA, null, DriverStatus.ACTIVE)));

		assertRefused(id, "routes");
	}

	@Test
	void applyingAfterARouteWasReorderedByHandIsRefused() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		Ready only = ready(schoolA, 3, "V 1");
		UUID a = pinned(schoolA);
		UUID b = pinned(schoolA);
		UUID routeId = routeWith(schoolA, "Old run", only, a, b);
		String id = idOf(generated(schoolA));

		mockMvc.perform(put(URL + "/" + routeId + "/stops").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"studentIds\":[\"%s\",\"%s\"]}".formatted(b, a))).andExpect(status().isOk());

		assertRefused(id, "routes");
	}

	@Test
	void aFailedApplyWritesNothingAtAll() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		List<UUID> students = fullFleetOfFour(vehicles);
		UUID foreignStudent = student(schoolB, "Foreign", StudentStatus.ACTIVE, 33.89, 35.49);
		String id = idOf(generated(schoolA));
		// Make the last planned route fail after the first has already been created.
		List<FleetProposalRoute> rows = fleetProposalRouteRepository.findAll();
		FleetProposalRoute last = rows.get(rows.size() - 1);
		List<UUID> stopOrder = new ArrayList<>(last.getStopOrder());
		stopOrder.add(foreignStudent);
		fleetProposalRouteRepository.delete(last);
		fleetProposalRouteRepository.save(FleetProposalRoute.builder().schoolId(last.getSchoolId())
				.proposalId(last.getProposalId()).vehicleId(last.getVehicleId()).driverId(last.getDriverId())
				.routeId(last.getRouteId()).name(last.getName()).stopOrder(stopOrder).build());

		// A student the proposal names is no longer there: the data changed, so it is the stale 409, not a 404.
		applyAs(schoolA, id).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("The students changed since these routes were generated. Generate them again."));

		assertEquals(0, routeRepository.count());
		for (UUID studentId : students) {
			assertNull(studentNow(studentId).getRouteId());
		}
		assertNull(studentNow(foreignStudent).getRouteId());
		assertEquals(1, fleetProposalRepository.count());
	}

	@Test
	void aFailedApplyLeavesExistingRoutesAndTheirStudentsExactlyAsTheyWere() throws Exception {
		List<Ready> vehicles = new ArrayList<>();
		List<UUID> students = fullFleetOfFour(vehicles);
		UUID routeId = routeWith(schoolA, "Old name", vehicles.get(0), students.get(1), students.get(0));
		String id = idOf(generated(schoolA));
		List<FleetProposalRoute> rows = fleetProposalRouteRepository.findAll();
		FleetProposalRoute last = rows.get(rows.size() - 1);
		List<UUID> stopOrder = new ArrayList<>(last.getStopOrder());
		stopOrder.add(UUID.randomUUID());
		fleetProposalRouteRepository.delete(last);
		fleetProposalRouteRepository.save(FleetProposalRoute.builder().schoolId(last.getSchoolId())
				.proposalId(last.getProposalId()).vehicleId(last.getVehicleId()).driverId(last.getDriverId())
				.routeId(last.getRouteId()).name(last.getName()).stopOrder(stopOrder).build());

		applyAs(schoolA, id).andExpect(status().isConflict());

		assertEquals(1, routeRepository.count());
		assertEquals(routeId, studentNow(students.get(1)).getRouteId());
		assertEquals(1, studentNow(students.get(1)).getStopPosition());
		assertEquals(routeId, studentNow(students.get(0)).getRouteId());
		assertEquals(2, studentNow(students.get(0)).getStopPosition());
		assertNull(studentNow(students.get(2)).getRouteId());
	}

	// ------------------------------------------------- who can do what, and where

	@Test
	void eachSchoolOnlyEverSeesAndChangesItsOwnData() throws Exception {
		fullFleetOfFour(new ArrayList<>());
		setSchoolArrivalTime(schoolB, LocalTime.of(7, 30));
		Ready other = ready(schoolB, 4, "B 1");
		UUID otherStudent = student(schoolB, "Other", StudentStatus.ACTIVE, 33.89, 35.49);
		UUID otherRoute = routeWith(schoolB, "B run", other, otherStudent);
		String id = idOf(generated(schoolA));

		applyAs(schoolB, id).andExpect(status().isNotFound());
		discardAs(schoolB, id).andExpect(status().isNotFound());
		applyAs(schoolA, id).andExpect(status().isOk());

		assertEquals(1, routeRepository.findBySchoolIdOrderByCreatedAtAsc(schoolB).size());
		assertEquals(otherRoute, studentNow(otherStudent).getRouteId());
		assertEquals(3, routeRepository.count());
	}

	@Test
	void anotherSchoolsVehiclesAndStudentsNeverEnterThePlan() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		ready(schoolB, 4, "B 1");
		UUID foreign = student(schoolB, "Other", StudentStatus.ACTIVE, 33.89, 35.49);
		UUID mine = pinned(schoolA);

		String body = generated(schoolA);

		assertEquals(List.of(mine.toString()), strings(body, "$.unplaced[*].studentId"));
		assertFalse(body.contains(foreign.toString()));
		assertEquals(0, ((List<?>) JsonPath.read(body, "$.routes")).size());
	}

	@Test
	void onlyTheHeadOfTransportationCanUseIt() throws Exception {
		for (Role role : new Role[] { Role.ADMIN, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(post(GENERATION).with(loggedInAs(role, schoolA))).andExpect(status().isForbidden());
			mockMvc.perform(post(GENERATION + "/" + UUID.randomUUID() + "/apply").with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
			mockMvc.perform(delete(GENERATION + "/" + UUID.randomUUID()).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
		}
		mockMvc.perform(post(GENERATION)).andExpect(status().isUnauthorized());
	}

	@Test
	void aMalformedProposalIdIsABadRequest() throws Exception {
		mockMvc.perform(post(GENERATION + "/not-a-uuid/apply").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Invalid request parameter"));
		mockMvc.perform(delete(GENERATION + "/not-a-uuid").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isBadRequest());
	}

	// ----------------------------------------------- the contract's sample files

	private String sample(String name) throws IOException {
		Path path = Path.of("../docs/contracts/samples/routing/" + name);
		if (!Files.exists(path)) {
			path = Path.of("docs/contracts/samples/routing/" + name);
		}
		return Files.readString(path);
	}

	@SuppressWarnings("unchecked")
	private Set<String> keys(Object json) {
		return new TreeSet<>(((Map<String, Object>) json).keySet());
	}

	private void assertSameKeys(String path, String sampleJson, String realJson) {
		assertEquals(keys(JsonPath.read(sampleJson, path)), keys(JsonPath.read(realJson, path)), path);
	}

	@Test
	void theResponseHasTheKeysOfTheContractSamples() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		Ready first = ready(schoolA, 2, "V 1");
		ready(schoolA, 2, "V 2");
		vehicle(schoolA, 4, "NODRIVER 1", true);
		UUID a = pinned(schoolA);
		pinned(schoolA);
		pinned(schoolA);
		pinned(schoolA);
		unpinned(schoolA);
		UUID inactive = student(schoolA, "Gone", StudentStatus.INACTIVE, 33.89, 35.49);
		routeWith(schoolA, "Old name", first, inactive, a);
		String real = generated(schoolA);
		String sample = sample("fleet-proposal.json");

		assertEquals(keys(JsonPath.read(sample, "$")), keys(JsonPath.read(real, "$")));
		for (String path : List.of("$.routes[0]", "$.routes[0].vehicle", "$.routes[0].driver", "$.routes[0].stops[0]",
				"$.unplaced[0]", "$.unplaced[0].reason", "$.excludedVehicles[0]", "$.excludedVehicles[0].vehicle",
				"$.school")) {
			assertSameKeys(path, sample, real);
		}
		// Only some routes have someone leaving, so both leaving entries are found by filter.
		assertEquals(keys(((List<?>) JsonPath.read(sample, "$.routes[?(@.leaving.length() > 0)].leaving[0]")).get(0)),
				keys(((List<?>) JsonPath.read(real, "$.routes[?(@.leaving.length() > 0)].leaving[0]")).get(0)));
	}

	@Test
	void theEmptyResponseHasTheSampleShapeAndWording() throws Exception {
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		vehicle(schoolA, 4, "NODRIVER 1", true);
		pinned(schoolA);
		pinned(schoolA);
		String real = generated(schoolA);
		String sample = sample("fleet-proposal-nothing.json");

		assertEquals(keys(JsonPath.read(sample, "$")), keys(JsonPath.read(real, "$")));
		assertNull(JsonPath.read(real, "$.id"));
		assertSameKeys("$.unplaced[0]", sample, real);
		assertEquals((String) JsonPath.read(sample, "$.unplaced[0].reason.message"),
				JsonPath.read(real, "$.unplaced[0].reason.message"));
	}
}
