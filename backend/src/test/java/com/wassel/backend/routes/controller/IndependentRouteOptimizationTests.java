package com.wassel.backend.routes.controller;

import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.entity.RouteVersion;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * SCRUM-228 OPT-01..06. Real controller, security, solver, services and H2 repositories.
 * Intentionally no test transaction: each HTTP mutation commits, and subsequent GETs and
 * repository reads must observe persisted state rather than a test persistence context.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class IndependentRouteOptimizationTests {

	private static final String URL = "/api/head-of-transport/routes/";
	private static final UUID SCHOOL = new UUID(228, 1);
	private static final UUID OTHER_SCHOOL = new UUID(228, 2);
	private static final LocalTime DEADLINE = LocalTime.of(8, 0);

	@Autowired private MockMvc mvc;
	@Autowired private RouteRepository routes;
	@Autowired private RouteProposalRepository proposals;
	@Autowired private RouteVersionRepository versions;
	@Autowired private StudentRepository students;
	@Autowired private VehicleRepository vehicles;
	@Autowired private DriverRepository drivers;
	@Autowired private SchoolSettingsRepository settings;

	private UUID routeId;
	private UUID vehicleId;
	private List<UUID> originalOrder;

	@BeforeEach
	void seedIndependentThreeStopRoute() {
		proposals.deleteAll();
		versions.deleteAll();
		routes.deleteAll();
		students.deleteAll();
		drivers.deleteAll();
		vehicles.deleteAll();
		settings.deleteAll();
		settings.save(SchoolSettings.builder().schoolId(SCHOOL).arrivalTime(DEADLINE).build());
		vehicleId = vehicles.save(Vehicle.builder().schoolId(SCHOOL).plateNumber("SCRUM228")
				.capacity(14).active(true).build()).getId();
		UUID driver = drivers.save(Driver.builder().schoolId(SCHOOL).firstName("Independent").lastName("Driver")
				.phone("+961 70 228 001").email("scrum228-driver@wassel.test")
				.status(DriverStatus.ACTIVE).invitedAt(Instant.now()).build()).getId();
		routeId = routes.save(Route.builder().schoolId(SCHOOL).name("SCRUM228 morning")
				.vehicleId(vehicleId).driverId(driver).build()).getId();
		// A-B-C are far-near-middle on a meridian south of school. Sparse positions make
		// an actual apply observable even if a solver were to return the unchanged order.
		originalOrder = List.of(studentAt("A", "33.866", 10), studentAt("B", "33.886", 20),
				studentAt("C", "33.876", 30));
	}

	private UUID studentAt(String name, String latitude, int position) {
		return students.save(Student.builder().schoolId(SCHOOL).firstName(name).lastName("Criteria")
				.grade("5").guardianName("Guardian " + name).guardianPhone("+961 3 228 001")
				.status(StudentStatus.ACTIVE).address("Pickup " + name).latitude(new BigDecimal(latitude))
				.longitude(new BigDecimal("35.484")).routeId(routeId).stopPosition(position).build()).getId();
	}

	private RequestPostProcessor as(Role role, UUID school) {
		User user = User.builder().id(new UUID(228, 99)).schoolId(school).email("scrum228@wassel.test")
				.passwordHash("unused").role(role).build();
		return authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private ResultActions owner(MockHttpServletRequestBuilder request) throws Exception {
		return mvc.perform(request.with(as(Role.HEAD_OF_TRANSPORT, SCHOOL)));
	}

	private String optimization(UUID id) { return URL + id + "/optimization"; }
	private String proposalUrl(UUID id) { return optimization(routeId) + "/" + id; }

	private DocumentContext body(ResultActions result) throws Exception {
		return JsonPath.parse(result.andReturn().getResponse().getContentAsString());
	}

	private List<UUID> ids(DocumentContext json, String path) {
		List<String> values = json.read(path);
		return values.stream().map(UUID::fromString).toList();
	}

	private DocumentContext propose() throws Exception {
		return body(owner(post(optimization(routeId))).andExpect(status().isCreated())
				.andExpect(jsonPath("$.feasible").value(true)).andExpect(jsonPath("$.reasons").isEmpty()));
	}

	private UUID proposalId(DocumentContext json) { return UUID.fromString(json.read("$.id")); }

	private List<Student> savedStops() {
		return students.findBySchoolIdAndRouteIdOrderByStopPositionAsc(SCHOOL, routeId);
	}

	private List<UUID> savedIds() { return savedStops().stream().map(Student::getId).toList(); }

	private List<UUID> reloadedIds() throws Exception {
		return ids(body(owner(get(URL + routeId)).andExpect(status().isOk())), "$.stops[*].studentId");
	}

	private void reorder(List<UUID> order) throws Exception {
		String ids = order.stream().map(id -> "\"" + id + "\"").collect(java.util.stream.Collectors.joining(","));
		owner(put(URL + routeId + "/stops").contentType(MediaType.APPLICATION_JSON)
				.content("{\"studentIds\":[" + ids + "]}")).andExpect(status().isOk());
	}

	private void changeCapacity(int capacity) {
		Vehicle vehicle = vehicles.findById(vehicleId).orElseThrow();
		vehicle.setCapacity(capacity);
		vehicles.saveAndFlush(vehicle);
	}

	private void changeDeadline(LocalTime time) {
		SchoolSettings school = settings.findById(SCHOOL).orElseThrow();
		school.setArrivalTime(time);
		settings.saveAndFlush(school);
	}

	private record Assignment(UUID id, UUID routeId, Integer position) { }
	private List<Assignment> assignments() {
		return savedStops().stream().map(s -> new Assignment(s.getId(), s.getRouteId(), s.getStopPosition())).toList();
	}

	private record Details(UUID id, String name, String address, BigDecimal latitude, BigDecimal longitude,
			String guardian, String phone, StudentStatus status, UUID parentId) { }
	private List<Details> details() {
		return savedStops().stream().map(s -> new Details(s.getId(), s.getFirstName(), s.getAddress(), s.getLatitude(),
				s.getLongitude(), s.getGuardianName(), s.getGuardianPhone(), s.getStatus(), s.getParentUserId()))
				.sorted(java.util.Comparator.comparing(Details::id)).toList();
	}

	@Test
	void opt01PreviewKeepsCommittedAssignmentsAndExposesARealImprovement() throws Exception {
		List<Assignment> before = assignments();
		List<Details> beforeDetails = details();
		DocumentContext proposal = propose();
		assertEquals(originalOrder, ids(proposal, "$.current.stops[*].studentId"));
		List<UUID> proposed = ids(proposal, "$.proposed.stops[*].studentId");
		assertEquals(originalOrder.stream().sorted().toList(), proposed.stream().sorted().toList());
		assertEquals(3, proposed.stream().distinct().count());
		assertEquals(13, proposal.<Integer>read("$.current.drivingMinutes"));
		assertEquals(9, proposal.<Integer>read("$.proposed.drivingMinutes"), "three short meridian legs, rounded separately");
		List<String> times = proposal.read("$.proposed.stops[*].arrivalTime");
		assertEquals(List.of("07:51", "07:54", "07:57"), times);
		assertEquals(before, assignments(), "preview must not renumber persisted positions");
		assertEquals(beforeDetails, details());
		assertEquals(originalOrder, reloadedIds());
		assertEquals(0, versions.count());
		var pending = proposals.findById(proposalId(proposal)).orElseThrow();
		assertEquals(SCHOOL, pending.getSchoolId());
		assertEquals(routeId, pending.getRouteId());
		assertEquals(originalOrder, pending.getBaseOrder());
		assertEquals(proposed, pending.getProposedOrder());
	}

	@Test
	void opt02ApplyPersistsExactProposalAndPreviousVersionWithoutChangingStudentDetails() throws Exception {
		List<Details> before = details();
		DocumentContext proposal = propose();
		List<UUID> proposed = ids(proposal, "$.proposed.stops[*].studentId");
		DocumentContext applied = body(owner(post(proposalUrl(proposalId(proposal)) + "/apply"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.studentCount").value(3))
				.andExpect(jsonPath("$.seatsLeft").value(11)));
		assertEquals(proposed, ids(applied, "$.stops[*].studentId"));
		assertEquals(proposed, savedIds());
		assertEquals(proposed, reloadedIds());
		assertEquals(List.of(1, 2, 3), savedStops().stream().map(Student::getStopPosition).toList());
		assertEquals(before, details());
		assertEquals(0, proposals.count());
		assertEquals(1, versions.count());
		RouteVersion version = versions.findAll().getFirst();
		assertEquals(originalOrder, version.getStopOrder());
		assertEquals(SCHOOL, version.getSchoolId());
		assertEquals(routeId, version.getRouteId());
		assertNotNull(version.getCreatedAt());
		owner(post(proposalUrl(proposalId(proposal)) + "/apply")).andExpect(status().isNotFound());
		assertEquals(1, versions.count(), "replay must not create a second version");
	}

	@Test
	void opt02VersionsRetainEachPreApplySnapshotAcrossMultipleApplications() throws Exception {
		UUID first = proposalId(propose());
		owner(post(proposalUrl(first) + "/apply")).andExpect(status().isOk());
		List<UUID> manual = new ArrayList<>(savedIds());
		Collections.reverse(manual);
		reorder(manual);
		UUID second = proposalId(propose());
		owner(post(proposalUrl(second) + "/apply")).andExpect(status().isOk());
		assertEquals(2, versions.count());
		List<List<UUID>> history = versions.findAll().stream().map(RouteVersion::getStopOrder).toList();
		assertTrue(history.contains(originalOrder));
		assertTrue(history.contains(manual), "manual reorder creates no version but its pre-apply order must be saved");
		assertEquals(2, versions.findAll().stream().map(RouteVersion::getId).distinct().count());
	}

	@Test
	void opt03DiscardCommitsDeletionWithoutChangingAssignmentsOrVersionHistory() throws Exception {
		List<Assignment> before = assignments();
		UUID id = proposalId(propose());
		owner(delete(proposalUrl(id))).andExpect(status().isNoContent()).andExpect(content().string(""));
		assertTrue(proposals.findById(id).isEmpty());
		assertEquals(before, assignments());
		assertEquals(originalOrder, reloadedIds());
		assertEquals(0, versions.count());
		owner(post(proposalUrl(id) + "/apply")).andExpect(status().isNotFound());
		owner(delete(proposalUrl(id))).andExpect(status().isNotFound());
		assertEquals(before, assignments());
	}

	@ParameterizedTest(name = "OPT-04: stale after {0}")
	@ValueSource(strings = { "reorder", "add", "remove" })
	void opt04StaleApplyRollsBackClaimAndPreservesTheNewCommittedState(String change) throws Exception {
		UUID id = proposalId(propose());
		if (change.equals("reorder")) {
			reorder(List.of(originalOrder.get(2), originalOrder.get(0), originalOrder.get(1)));
		} else if (change.equals("add")) {
			studentAt("D", "33.881", 40);
		} else {
			owner(delete(URL + routeId + "/students/" + originalOrder.get(1))).andExpect(status().isOk());
		}
		List<Assignment> changed = assignments();
		owner(post(proposalUrl(id) + "/apply")).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail", containsString("changed")));
		assertEquals(changed, assignments());
		assertEquals(savedIds(), reloadedIds());
		assertEquals(0, versions.count());
		assertTrue(proposals.findById(id).isPresent(), "409 must roll back the proposal claim");
		owner(delete(proposalUrl(id))).andExpect(status().isNoContent());
	}

	@Test
	void opt04ReplacedProposalCannotBeAppliedOrDiscardTheNewProposal() throws Exception {
		UUID old = proposalId(propose());
		UUID fresh = proposalId(propose());
		assertNotEquals(old, fresh);
		owner(post(proposalUrl(old) + "/apply")).andExpect(status().isNotFound());
		owner(delete(proposalUrl(old))).andExpect(status().isNotFound());
		assertTrue(proposals.findById(fresh).isPresent());
		assertEquals(1, proposals.count());
		assertEquals(originalOrder, reloadedIds());
		assertEquals(0, versions.count());
	}

	@Test
	void opt05OtherSchoolCannotReadProposeApplyOrDiscardTheOwnersRoute() throws Exception {
		UUID id = proposalId(propose());
		List<Assignment> before = assignments();
		for (MockHttpServletRequestBuilder request : List.of(get(URL + routeId), post(optimization(routeId)),
				post(proposalUrl(id) + "/apply"), delete(proposalUrl(id)))) {
			mvc.perform(request.with(as(Role.HEAD_OF_TRANSPORT, OTHER_SCHOOL))).andExpect(status().isNotFound());
		}
		assertEquals(before, assignments());
		assertEquals(0, versions.count());
		assertTrue(proposals.findById(id).isPresent());
		owner(post(proposalUrl(id) + "/apply")).andExpect(status().isOk());
	}

	@ParameterizedTest(name = "OPT-05: {0} cannot optimize")
	@EnumSource(value = Role.class, names = { "PARENT", "DRIVER", "ADMIN" })
	void opt05OtherRolesCannotUseAnyOptimizationEndpoint(Role role) throws Exception {
		UUID id = proposalId(propose());
		for (MockHttpServletRequestBuilder request : List.of(post(optimization(routeId)),
				post(proposalUrl(id) + "/apply"), delete(proposalUrl(id)))) {
			mvc.perform(request.with(as(role, SCHOOL))).andExpect(status().isForbidden());
		}
		assertEquals(originalOrder, savedIds());
		assertTrue(proposals.findById(id).isPresent());
		assertEquals(0, versions.count());
	}

	@Test
	void opt05AnonymousRequestsCannotConsumeAProposal() throws Exception {
		UUID id = proposalId(propose());
		for (MockHttpServletRequestBuilder request : List.of(post(optimization(routeId)),
				post(proposalUrl(id) + "/apply"), delete(proposalUrl(id)))) {
			mvc.perform(request).andExpect(status().isUnauthorized());
		}
		assertTrue(proposals.findById(id).isPresent());
		assertEquals(originalOrder, savedIds());
		assertEquals(0, versions.count());
	}

	@Test
	void opt06UnknownRouteAndProposalIdsReturn404WithoutAffectingThePendingProposal() throws Exception {
		UUID valid = proposalId(propose());
		UUID unknown = new UUID(228, 404);
		owner(post(optimization(unknown))).andExpect(status().isNotFound());
		owner(post(optimization(unknown) + "/" + valid + "/apply")).andExpect(status().isNotFound());
		owner(delete(optimization(unknown) + "/" + valid)).andExpect(status().isNotFound());
		owner(post(proposalUrl(unknown) + "/apply")).andExpect(status().isNotFound());
		owner(delete(proposalUrl(unknown))).andExpect(status().isNotFound());
		assertTrue(proposals.findById(valid).isPresent());
		assertEquals(originalOrder, reloadedIds());
		assertEquals(0, versions.count());
	}

	@Test
	void opt06MalformedUuidPathsAre400AndDoNotConsumeThePendingProposal() throws Exception {
		UUID pending = proposalId(propose());
		assertAll("Malformed UUIDs are client input errors, never server errors",
				() -> owner(post(URL + "not-a-uuid/optimization")).andExpect(status().isBadRequest()),
				() -> owner(post(optimization(routeId) + "/not-a-uuid/apply")).andExpect(status().isBadRequest()),
				() -> owner(delete(optimization(routeId) + "/not-a-uuid")).andExpect(status().isBadRequest()),
				() -> assertTrue(proposals.findById(pending).isPresent()),
				() -> assertEquals(originalOrder, reloadedIds()),
				() -> assertEquals(0, versions.count()));
	}

	@ParameterizedTest(name = "OPT-06: invalid route input {0}")
	@ValueSource(strings = { "empty", "no-arrival", "no-pin", "partial-pin" })
	void opt06UnoptimizableRoutesReturn409AndPreservePendingProposal(String invalid) throws Exception {
		UUID pending = proposalId(propose());
		if (invalid.equals("empty")) {
			for (UUID id : originalOrder) {
				owner(delete(URL + routeId + "/students/" + id)).andExpect(status().isOk());
			}
		} else if (invalid.equals("no-arrival")) {
			changeDeadline(null);
		} else {
			Student unpinned = students.findById(originalOrder.getFirst()).orElseThrow();
			unpinned.setLatitude(null);
			if (invalid.equals("no-pin")) unpinned.setLongitude(null);
			students.saveAndFlush(unpinned);
		}
		List<Assignment> before = assignments();
		ResultActions rejected = owner(post(optimization(routeId))).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").isNotEmpty());
		if (invalid.endsWith("pin")) {
			rejected.andExpect(jsonPath("$.studentIds[0]").value(originalOrder.getFirst().toString()))
					.andExpect(jsonPath("$.detail", containsString("A Criteria")));
		}
		assertEquals(before, assignments());
		assertTrue(proposals.findById(pending).isPresent(), "a rejected optimization must not erase its predecessor");
		assertEquals(0, versions.count());
	}

	@ParameterizedTest(name = "SOL-03/08 over HTTP: {0}")
	@ValueSource(strings = { "capacity", "deadline" })
	void infeasible201ClearsAnEarlierProposalWithoutDroppingOrReorderingStudents(String cause) throws Exception {
		UUID pending = proposalId(propose());
		if (cause.equals("capacity")) {
			// SOL-03's 15 students / 14 seats, reached legitimately by lowering capacity.
			changeCapacity(15);
			for (int i = 4; i <= 15; i++) studentAt("Extra" + i, "33.881", i * 10);
			changeCapacity(14);
		} else changeDeadline(LocalTime.of(6, 1));
		List<Assignment> before = assignments();
		List<UUID> beforeIds = savedIds();
		owner(post(optimization(routeId))).andExpect(status().isCreated())
				.andExpect(jsonPath("$.feasible").value(false)).andExpect(jsonPath("$.id").isEmpty())
				.andExpect(jsonPath("$.proposed").isEmpty()).andExpect(jsonPath("$.reasons.length()").value(1))
				.andExpect(jsonPath("$.reasons[0].code").value(cause.equals("capacity") ? "CAPACITY_EXCEEDED" : "ARRIVAL_TIME_UNREACHABLE"));
		assertEquals(before, assignments());
		assertEquals(beforeIds, reloadedIds());
		assertEquals(0, proposals.count());
		assertEquals(0, versions.count());
		owner(post(proposalUrl(pending) + "/apply")).andExpect(status().isNotFound());
	}
}
