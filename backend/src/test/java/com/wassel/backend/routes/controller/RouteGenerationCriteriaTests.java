package com.wassel.backend.routes.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.FleetProposalRepository;
import com.wassel.backend.routes.repository.FleetProposalRouteRepository;
import com.wassel.backend.routes.repository.RouteRepository;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-216: the generate-all acceptance criteria, written from the ticket, not from
 * {@code RouteGenerationControllerTests} or {@code FleetPlannerTests} (the author's own suites for
 * SCRUM-207 and SCRUM-206). Covers only what SCRUM-216 asks for: every active student with
 * coordinates ends up on exactly one route or reported as unplaceable, no vehicle ever exceeds its
 * capacity, too few seats is a report rather than a crash, and applying or discarding twice is safe.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RouteGenerationCriteriaTests {

	private static final String GENERATION = "/api/head-of-transport/routes/generation";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private RouteRepository routeRepository;

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

	@BeforeEach
	void cleanDatabase() {
		fleetProposalRouteRepository.deleteAll();
		fleetProposalRepository.deleteAll();
		routeRepository.deleteAll();
		driverRepository.deleteAll();
		vehicleRepository.deleteAll();
		studentRepository.deleteAll();
		schoolSettingsRepository.deleteAll();
	}

	// ---------------------------------------------------------------- helpers

	private RequestPostProcessor asHeadOfTransport(UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email("head@wassel.test").passwordHash("x")
				.role(Role.HEAD_OF_TRANSPORT).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_HEAD_OF_TRANSPORT"))));
	}

	private void setArrival(UUID schoolId, LocalTime time) {
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(schoolId).arrivalTime(time).build());
	}

	private UUID vehicleWithDriver(UUID schoolId, int capacity, String plate) {
		UUID vehicleId = vehicleRepository
				.save(Vehicle.builder().schoolId(schoolId).plateNumber(plate).capacity(capacity).active(true).build())
				.getId();
		driverRepository.save(Driver.builder().schoolId(schoolId).firstName("Fresh").lastName("Driver")
				.phone("0" + (int) (Math.random() * 100_000_000)).email(UUID.randomUUID() + "@wassel.test")
				.status(DriverStatus.ACTIVE).invitedAt(Instant.now()).assignedVehicleId(vehicleId).build());
		return vehicleId;
	}

	/** An active student with a pin a short distance from the school, so routes are easily drivable. */
	private UUID activeStudentNear(UUID schoolId, int index) {
		return studentRepository.save(Student.builder().schoolId(schoolId).firstName("Student" + index)
				.lastName("Fresh").grade("6").guardianName("Guardian").guardianPhone("0" + (1_000_000 + index))
				.status(StudentStatus.ACTIVE).address("Some street")
				.latitude(BigDecimal.valueOf(33.89 + index * 0.0015)).longitude(BigDecimal.valueOf(35.49 + index * 0.0015))
				.build()).getId();
	}

	private ResultActions generate(UUID schoolId) throws Exception {
		return mockMvc.perform(post(GENERATION).with(asHeadOfTransport(schoolId)));
	}

	private ResultActions apply(UUID schoolId, Object proposalId) throws Exception {
		return mockMvc.perform(post(GENERATION + "/" + proposalId + "/apply").with(asHeadOfTransport(schoolId)));
	}

	private ResultActions discard(UUID schoolId, Object proposalId) throws Exception {
		return mockMvc.perform(delete(GENERATION + "/" + proposalId).with(asHeadOfTransport(schoolId)));
	}

	private String generatedBody(UUID schoolId) throws Exception {
		return generate(schoolId).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
	}

	private Object proposalIdOf(String body) {
		return JsonPath.read(body, "$.id");
	}

	// ---------------------------------------------------- every student placed once or reported

	@Test
	void everyActiveStudentEndsUpOnExactlyOneRouteOrReportedUnplaceable() throws Exception {
		UUID schoolId = UUID.randomUUID();
		setArrival(schoolId, LocalTime.of(7, 30));
		vehicleWithDriver(schoolId, 4, "F 001");
		vehicleWithDriver(schoolId, 4, "F 002");
		List<UUID> studentIds = new ArrayList<>();
		for (int i = 0; i < 7; i++) {
			studentIds.add(activeStudentNear(schoolId, i));
		}

		String body = generatedBody(schoolId);

		List<String> placed = JsonPath.read(body, "$.routes[*].stops[*].studentId");
		List<String> unplaced = JsonPath.read(body, "$.unplaced[*].studentId");
		Set<String> accounted = new HashSet<>(placed);
		accounted.addAll(unplaced);
		assertEquals(studentIds.size(), placed.size() + unplaced.size(), "no student is counted twice");
		assertEquals(studentIds.size(), accounted.size(), "every student appears exactly once overall");
		Set<String> expected = new HashSet<>();
		studentIds.forEach(id -> expected.add(id.toString()));
		assertEquals(expected, accounted, "every active student is placed or reported, and nobody else is");
	}

	// -------------------------------------------------------------- capacity never exceeded

	@Test
	void noRouteEverCarriesMoreStudentsThanItsVehiclesSeatsEvenAfterApplying() throws Exception {
		UUID schoolId = UUID.randomUUID();
		setArrival(schoolId, LocalTime.of(7, 30));
		vehicleWithDriver(schoolId, 2, "C 001");
		vehicleWithDriver(schoolId, 2, "C 002");
		vehicleWithDriver(schoolId, 2, "C 003");
		for (int i = 0; i < 6; i++) {
			activeStudentNear(schoolId, i);
		}

		String body = generatedBody(schoolId);
		apply(schoolId, proposalIdOf(body)).andExpect(status().isOk());

		for (Route route : routeRepository.findBySchoolIdOrderByCreatedAtAsc(schoolId)) {
			int capacity = vehicleRepository.findById(route.getVehicleId()).orElseThrow().getCapacity();
			long onRoute = studentRepository.countBySchoolIdAndRouteId(schoolId, route.getId());
			assertTrue(onRoute <= capacity,
					"route " + route.getId() + " carries " + onRoute + " for " + capacity + " seats");
		}
	}

	// ------------------------------------------------------ too few seats is a report, not a crash

	@Test
	void tooFewSeatsAnswersSuccessfullyWithACapacityReportInsteadOfFailing() throws Exception {
		UUID schoolId = UUID.randomUUID();
		setArrival(schoolId, LocalTime.of(7, 30));
		vehicleWithDriver(schoolId, 1, "T 001");
		vehicleWithDriver(schoolId, 1, "T 002");
		for (int i = 0; i < 5; i++) {
			activeStudentNear(schoolId, i);
		}

		generate(schoolId).andExpect(status().isCreated())
				.andExpect(jsonPath("$.unplaced.length()").value(3))
				.andExpect(jsonPath("$.unplaced[0].reason.code").value("CAPACITY_EXCEEDED"))
				.andExpect(jsonPath("$.unplaced[0].reason.message").value("There are 5 students but the vehicles seat 2."));
	}

	@Test
	void noVehiclesAtAllStillAnswersSuccessfullyWithEveryStudentReportedUnplaced() throws Exception {
		UUID schoolId = UUID.randomUUID();
		setArrival(schoolId, LocalTime.of(7, 30));
		activeStudentNear(schoolId, 0);
		activeStudentNear(schoolId, 1);

		generate(schoolId).andExpect(status().isCreated())
				.andExpect(jsonPath("$.routes.length()").value(0))
				.andExpect(jsonPath("$.unplaced.length()").value(2))
				.andExpect(jsonPath("$.unplaced[0].reason.code").value("CAPACITY_EXCEEDED"));
	}

	// --------------------------------------------------------- applying or discarding twice is safe

	@Test
	void applyingTheSameProposalASecondTimeNeverDuplicatesARoute() throws Exception {
		UUID schoolId = UUID.randomUUID();
		setArrival(schoolId, LocalTime.of(7, 30));
		vehicleWithDriver(schoolId, 3, "D 001");
		for (int i = 0; i < 3; i++) {
			activeStudentNear(schoolId, i);
		}
		String body = generatedBody(schoolId);
		Object proposalId = proposalIdOf(body);

		apply(schoolId, proposalId).andExpect(status().isOk());
		long afterFirstApply = routeRepository.count();
		apply(schoolId, proposalId).andExpect(status().isNotFound());

		assertEquals(1, afterFirstApply);
		assertEquals(afterFirstApply, routeRepository.count(), "a second apply creates nothing more");
	}

	@Test
	void discardingAProposalLeavesRoutesAndStudentsUntouchedAndCanOnlyHappenOnce() throws Exception {
		UUID schoolId = UUID.randomUUID();
		setArrival(schoolId, LocalTime.of(7, 30));
		vehicleWithDriver(schoolId, 3, "X 001");
		List<UUID> studentIds = new ArrayList<>();
		for (int i = 0; i < 3; i++) {
			studentIds.add(activeStudentNear(schoolId, i));
		}
		String body = generatedBody(schoolId);
		Object proposalId = proposalIdOf(body);

		discard(schoolId, proposalId).andExpect(status().isNoContent());

		assertEquals(0, routeRepository.count(), "discarding changes no route");
		for (UUID studentId : studentIds) {
			assertNull(studentRepository.findById(studentId).orElseThrow().getRouteId(), "discarding assigns no student");
		}
		discard(schoolId, proposalId).andExpect(status().isNotFound());
	}

	// --------------------------------------------------- generating twice at once does not corrupt state

	@Test
	void aSecondGenerateWhileOneIsStillRunningIsRefusedAndTheGuardIsReleasedAfterwards() throws Exception {
		UUID schoolId = UUID.randomUUID();
		setArrival(schoolId, LocalTime.of(7, 30));
		for (int v = 0; v < 3; v++) {
			vehicleWithDriver(schoolId, 25, "P 00" + v);
		}
		for (int i = 0; i < 60; i++) {
			activeStudentNear(schoolId, i);
		}

		CompletableFuture<Integer> firstStatus = CompletableFuture.supplyAsync(() -> {
			try {
				return generate(schoolId).andReturn().getResponse().getStatus();
			}
			catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
		Thread.sleep(300); // the first call is still solving a 60-student, 3-vehicle fleet
		int secondStatus = generate(schoolId).andReturn().getResponse().getStatus();

		assertEquals(201, firstStatus.get(60, TimeUnit.SECONDS), "the first generation succeeds");
		assertEquals(409, secondStatus, "a generation already running refuses a second one");

		generate(schoolId).andExpect(status().isCreated());
	}
}
