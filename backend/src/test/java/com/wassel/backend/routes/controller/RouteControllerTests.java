package com.wassel.backend.routes.controller;

import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.jayway.jsonpath.JsonPath;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RouteControllerTests {

	private static final String URL = "/api/head-of-transport/routes";

	private final UUID schoolA = UUID.randomUUID();

	private final UUID schoolB = UUID.randomUUID();

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

	private RequestPostProcessor loggedInAs(Role role, UUID schoolId) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private UUID aVehicle(UUID schoolId, boolean active) {
		return aVehicle(schoolId, active, 14);
	}

	private UUID aVehicle(UUID schoolId, boolean active, int capacity) {
		Vehicle vehicle = vehicleRepository.save(Vehicle.builder().schoolId(schoolId)
				.plateNumber("A " + (100000 + (int) (Math.random() * 900000))).capacity(capacity).active(active)
				.build());
		return vehicle.getId();
	}

	private UUID aDriver(UUID schoolId) {
		return aDriver(schoolId, DriverStatus.ACTIVE);
	}

	// There's no deactivate endpoint on the drivers module yet, so a deactivated driver can only
	// be produced directly through the repository, same as in production data today.
	private UUID aDriver(UUID schoolId, DriverStatus status) {
		Driver driver = driverRepository.save(Driver.builder().schoolId(schoolId)
				.firstName("Walid").lastName("Barakat").phone("0" + (int) (Math.random() * 100000000))
				.email(UUID.randomUUID() + "@wassel.test").status(status).invitedAt(Instant.now())
				.build());
		return driver.getId();
	}

	private String route(String name, UUID vehicleId, UUID driverId) {
		return "{\"name\":\"%s\",\"vehicleId\":\"%s\",\"driverId\":\"%s\"}".formatted(name, vehicleId, driverId);
	}

	private String createAs(UUID schoolId, String name, UUID vehicleId, UUID driverId) throws Exception {
		String body = mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
						.contentType(MediaType.APPLICATION_JSON).content(route(name, vehicleId, driverId)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		Matcher matcher = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(body);
		matcher.find();
		return matcher.group(1);
	}

	private UUID aStudent(UUID schoolId) {
		return aStudent(schoolId, StudentStatus.ACTIVE);
	}

	private UUID aStudent(UUID schoolId, StudentStatus status) {
		return aStudentAt(schoolId, status, 33.886, 35.485);
	}

	private UUID aStudentAt(UUID schoolId, double latitude, double longitude) {
		return aStudentAt(schoolId, StudentStatus.ACTIVE, latitude, longitude);
	}

	private UUID aStudentAt(UUID schoolId, StudentStatus status, double latitude, double longitude) {
		Student student = studentRepository.save(Student.builder().schoolId(schoolId)
				.firstName("Hadi").lastName("Rizk").grade("5").guardianName("Guardian Name")
				.guardianPhone("0" + (int) (Math.random() * 100000000)).status(status)
				.address("Verdun Street, Beirut").latitude(BigDecimal.valueOf(latitude))
				.longitude(BigDecimal.valueOf(longitude)).build());
		return student.getId();
	}

	private UUID aStudentWithNoPin(UUID schoolId) {
		Student student = studentRepository.save(Student.builder().schoolId(schoolId)
				.firstName("Hadi").lastName("Rizk").grade("5").guardianName("Guardian Name")
				.guardianPhone("0" + (int) (Math.random() * 100000000)).status(StudentStatus.ACTIVE).build());
		return student.getId();
	}

	private void setSchoolArrivalTime(UUID schoolId, LocalTime arrivalTime) {
		schoolSettingsRepository.save(SchoolSettings.builder().schoolId(schoolId).arrivalTime(arrivalTime).build());
	}

	private org.springframework.test.web.servlet.ResultActions assignAs(UUID schoolId, String routeId, UUID studentId)
			throws Exception {
		return mockMvc.perform(post(URL + "/" + routeId + "/students").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
				.contentType(MediaType.APPLICATION_JSON).content("{\"studentId\":\"%s\"}".formatted(studentId)));
	}

	private org.springframework.test.web.servlet.ResultActions removeAs(UUID schoolId, String routeId, UUID studentId)
			throws Exception {
		return mockMvc.perform(delete(URL + "/" + routeId + "/students/" + studentId)
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId)));
	}

	private org.springframework.test.web.servlet.ResultActions reorderAs(UUID schoolId, String routeId,
			UUID... studentIds) throws Exception {
		String ids = java.util.Arrays.stream(studentIds).map(id -> "\"" + id + "\"")
				.collect(java.util.stream.Collectors.joining(","));
		return mockMvc.perform(put(URL + "/" + routeId + "/stops").with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId))
				.contentType(MediaType.APPLICATION_JSON).content("{\"studentIds\":[%s]}".formatted(ids)));
	}

	@Test
	void listIsEmptyBeforeAnyRouteIsAdded() throws Exception {
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void headOfTransportCanCreateARouteAndSeeItInTheList() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		UUID driverId = aDriver(schoolA);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(route("Verdun morning run", vehicleId, driverId)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.name").value("Verdun morning run"))
				.andExpect(jsonPath("$.vehicle.id").value(vehicleId.toString()))
				.andExpect(jsonPath("$.vehicle.capacity").value(14))
				.andExpect(jsonPath("$.driver.id").value(driverId.toString()))
				.andExpect(jsonPath("$.studentCount").value(0))
				.andExpect(jsonPath("$.seatsLeft").value(14))
				.andExpect(jsonPath("$.school.latitude").isNotEmpty())
				.andExpect(jsonPath("$.school.arrivalTime").isEmpty())
				.andExpect(jsonPath("$.stops.length()").value(0));

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Verdun morning run"))
				.andExpect(jsonPath("$[0].seatsLeft").value(14));
	}

	@Test
	void creatingWithAnInactiveVehicleIsRejected() throws Exception {
		UUID vehicleId = aVehicle(schoolA, false);
		UUID driverId = aDriver(schoolA);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(route("Hamra morning run", vehicleId, driverId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.vehicleId").value("Cannot put a deactivated vehicle on a route."));
		assertEquals(0, routeRepository.count());
	}

	@Test
	void creatingWithADeactivatedDriverIsRejected() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		UUID driverId = aDriver(schoolA, DriverStatus.DEACTIVATED);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content(route("Hamra morning run", vehicleId, driverId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.driverId").value("Cannot put a deactivated driver on a route."));
		assertEquals(0, routeRepository.count());
	}

	@Test
	void editingToADeactivatedDriverIsRejected() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID deactivatedDriverId = aDriver(schoolA, DriverStatus.DEACTIVATED);

		mockMvc.perform(put(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run", aVehicle(schoolA, true), deactivatedDriverId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.driverId").value("Cannot put a deactivated driver on a route."));
	}

	@Test
	void creatingWithAVehicleAlreadyOnAnotherRouteIsRejected() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		createAs(schoolA, "Verdun morning run", vehicleId, aDriver(schoolA));

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Hamra morning run", vehicleId, aDriver(schoolA))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.vehicleId")
						.value("Vehicle is already on route \"Verdun morning run\"."));
		assertEquals(1, routeRepository.count());
	}

	@Test
	void creatingWithADriverAlreadyOnAnotherRouteIsRejected() throws Exception {
		UUID driverId = aDriver(schoolA);
		createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), driverId);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Hamra morning run", aVehicle(schoolA, true), driverId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.driverId")
						.value("Driver is already on route \"Verdun morning run\"."));
	}

	@Test
	void nameVehicleIdAndDriverIdAreRequired() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.name").value("Name is required"))
				.andExpect(jsonPath("$.errors.vehicleId").value("Vehicle id is required"))
				.andExpect(jsonPath("$.errors.driverId").value("Driver id is required"));
		assertEquals(0, routeRepository.count());
	}

	@Test
	void aNameOver100CharactersIsRejectedAsValidationNotAConflict() throws Exception {
		String tooLong = "A".repeat(101);

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route(tooLong, aVehicle(schoolA, true), aDriver(schoolA))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.name").value("Name must be at most 100 characters"));
		assertEquals(0, routeRepository.count());
	}

	@Test
	void creatingWithAnUnknownVehicleOrDriverIsNotFound() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run", UUID.randomUUID(), aDriver(schoolA))))
				.andExpect(status().isNotFound());

		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run", aVehicle(schoolA, true), UUID.randomUUID())))
				.andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanGetARoute() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Verdun morning run"));
	}

	@Test
	void gettingAnUnknownOrOtherSchoolRouteIsNotFound() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(get(URL + "/" + UUID.randomUUID()).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNotFound());
		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanEditARoute() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		UUID driverId = aDriver(schoolA);
		String id = createAs(schoolA, "Verdun morning run", vehicleId, driverId);

		UUID newVehicleId = aVehicle(schoolA, true);
		mockMvc.perform(put(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Hamra morning run", newVehicleId, driverId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Hamra morning run"))
				.andExpect(jsonPath("$.vehicle.id").value(newVehicleId.toString()));
	}

	@Test
	void editingARouteToKeepItsOwnVehicleAndDriverIsNotAConflict() throws Exception {
		UUID vehicleId = aVehicle(schoolA, true);
		UUID driverId = aDriver(schoolA);
		String id = createAs(schoolA, "Verdun morning run", vehicleId, driverId);

		mockMvc.perform(put(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run (renamed)", vehicleId, driverId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Verdun morning run (renamed)"));
	}

	@Test
	void editingToAVehicleAlreadyOnAnotherRouteIsRejected() throws Exception {
		UUID takenVehicleId = aVehicle(schoolA, true);
		createAs(schoolA, "Verdun morning run", takenVehicleId, aDriver(schoolA));
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)));
		mockMvc.perform(put(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Hamra morning run", takenVehicleId, aDriver(schoolA))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.vehicleId")
						.value("Vehicle is already on route \"Verdun morning run\"."));
	}

	@Test
	void headOfTransportCanDeleteARoute() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(delete(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNoContent());
		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNotFound());
	}

	@Test
	void deletingARouteReleasesItsStudents() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID studentId = aStudent(schoolA);
		assignAs(schoolA, id, studentId).andExpect(status().isOk());

		mockMvc.perform(delete(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNoContent());

		assertEquals(null, studentRepository.findById(studentId).orElseThrow().getRouteId());
	}

	@Test
	void deletingAnUnknownOrOtherSchoolRouteIsNotFound() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		mockMvc.perform(delete(URL + "/" + UUID.randomUUID()).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNotFound());
		mockMvc.perform(delete(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(status().isNotFound());
	}

	@Test
	void eachSchoolOnlySeesItsOwnRoutes() throws Exception {
		createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		createAs(schoolB, "Hamra morning run", aVehicle(schoolB, true), aDriver(schoolB));

		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Verdun morning run"));
		mockMvc.perform(get(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolB)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value("Hamra morning run"));
	}

	@Test
	void aSchoolCannotUseAnotherSchoolsVehicleOrDriver() throws Exception {
		mockMvc.perform(post(URL).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA))
						.contentType(MediaType.APPLICATION_JSON)
						.content(route("Verdun morning run", aVehicle(schoolB, true), aDriver(schoolA))))
				.andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanAddAStudentAndSeeThemAsAStop() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID studentId = aStudent(schoolA);

		assignAs(schoolA, id, studentId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.studentCount").value(1))
				.andExpect(jsonPath("$.seatsLeft").value(13))
				.andExpect(jsonPath("$.stops.length()").value(1))
				.andExpect(jsonPath("$.stops[0].studentId").value(studentId.toString()))
				.andExpect(jsonPath("$.stops[0].position").value(1))
				.andExpect(jsonPath("$.stops[0].firstName").value("Hadi"))
				.andExpect(jsonPath("$.stops[0].address").value("Verdun Street, Beirut"))
				.andExpect(jsonPath("$.stops[0].arrivalTime").isEmpty());
	}

	@Test
	void stopsAreInInsertionOrderWithSequentialPositions() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID first = aStudent(schoolA);
		UUID second = aStudent(schoolA);

		assignAs(schoolA, id, first).andExpect(status().isOk());
		assignAs(schoolA, id, second)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.stops.length()").value(2))
				.andExpect(jsonPath("$.stops[0].studentId").value(first.toString()))
				.andExpect(jsonPath("$.stops[0].position").value(1))
				.andExpect(jsonPath("$.stops[1].studentId").value(second.toString()))
				.andExpect(jsonPath("$.stops[1].position").value(2));
	}

	@Test
	void addingBeyondCapacityIsRejectedWithTheCountAndCapacity() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true, 1), aDriver(schoolA));
		assignAs(schoolA, id, aStudent(schoolA)).andExpect(status().isOk());

		assignAs(schoolA, id, aStudent(schoolA))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("The route has 1 students but the vehicle seats 1."));
	}

	@Test
	void reAddingAStudentAlreadyOnAFullRouteIsNotACapacityError() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true, 1), aDriver(schoolA));
		UUID studentId = aStudent(schoolA);
		assignAs(schoolA, id, studentId).andExpect(status().isOk());

		assignAs(schoolA, id, studentId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.studentCount").value(1));
	}

	@Test
	void capacityIsCheckedBeforeTheStudentIsResolvedSoAnUnknownStudentStillGetsCapacityFirst() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true, 1), aDriver(schoolA));
		assignAs(schoolA, id, aStudent(schoolA)).andExpect(status().isOk());

		assignAs(schoolA, id, UUID.randomUUID())
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("The route has 1 students but the vehicle seats 1."));
	}

	@Test
	void addingAnInactiveStudentIsRejected() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID studentId = aStudent(schoolA, StudentStatus.INACTIVE);

		assignAs(schoolA, id, studentId)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.errors.studentId").value("Only active students can be added to a route."));
	}

	@Test
	void addingAnUnknownOrOtherSchoolStudentIsNotFound() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		assignAs(schoolA, id, UUID.randomUUID()).andExpect(status().isNotFound());
		assignAs(schoolA, id, aStudent(schoolB)).andExpect(status().isNotFound());
	}

	@Test
	void addingAStudentAlreadyOnAnotherRouteMovesThemAndTheOldRouteCountDrops() throws Exception {
		String routeA = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		String routeB = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID studentId = aStudent(schoolA);
		assignAs(schoolA, routeA, studentId).andExpect(status().isOk());

		assignAs(schoolA, routeB, studentId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.studentCount").value(1));

		mockMvc.perform(get(URL + "/" + routeA).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.studentCount").value(0))
				.andExpect(jsonPath("$.stops.length()").value(0));
	}

	@Test
	void headOfTransportCanRemoveAStudentAndTheCountDrops() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID studentId = aStudent(schoolA);
		assignAs(schoolA, id, studentId).andExpect(status().isOk());

		removeAs(schoolA, id, studentId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.studentCount").value(0))
				.andExpect(jsonPath("$.stops.length()").value(0));
	}

	@Test
	void removingAStudentNotOnThatRouteIsNotFound() throws Exception {
		String routeA = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		String routeB = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID studentId = aStudent(schoolA);
		assignAs(schoolA, routeA, studentId).andExpect(status().isOk());

		removeAs(schoolA, routeB, studentId).andExpect(status().isNotFound());
		removeAs(schoolA, routeA, aStudent(schoolA)).andExpect(status().isNotFound());
	}

	@Test
	void removingFromAnUnknownOrOtherSchoolRouteIsNotFound() throws Exception {
		UUID studentId = aStudent(schoolA);

		removeAs(schoolA, UUID.randomUUID().toString(), studentId).andExpect(status().isNotFound());
	}

	@Test
	void headOfTransportCanReorderStops() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID first = aStudent(schoolA);
		UUID second = aStudent(schoolA);
		UUID third = aStudent(schoolA);
		assignAs(schoolA, id, first).andExpect(status().isOk());
		assignAs(schoolA, id, second).andExpect(status().isOk());
		assignAs(schoolA, id, third).andExpect(status().isOk());

		reorderAs(schoolA, id, third, first, second)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.stops[0].studentId").value(third.toString()))
				.andExpect(jsonPath("$.stops[0].position").value(1))
				.andExpect(jsonPath("$.stops[1].studentId").value(first.toString()))
				.andExpect(jsonPath("$.stops[1].position").value(2))
				.andExpect(jsonPath("$.stops[2].studentId").value(second.toString()))
				.andExpect(jsonPath("$.stops[2].position").value(3));

		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.stops[0].studentId").value(third.toString()));
	}

	@Test
	void reorderingAnEmptyRouteWithAnEmptyListSucceeds() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		reorderAs(schoolA, id).andExpect(status().isOk()).andExpect(jsonPath("$.stops.length()").value(0));
	}

	@Test
	void reorderingWithARepeatedStudentIsRejected() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID first = aStudent(schoolA);
		UUID second = aStudent(schoolA);
		assignAs(schoolA, id, first).andExpect(status().isOk());
		assignAs(schoolA, id, second).andExpect(status().isOk());

		reorderAs(schoolA, id, first, first)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.studentIds")
						.value("A student appears more than once in the new order."));
	}

	@Test
	void reorderingWithAMissingStopIsRejected() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID first = aStudent(schoolA);
		UUID second = aStudent(schoolA);
		assignAs(schoolA, id, first).andExpect(status().isOk());
		assignAs(schoolA, id, second).andExpect(status().isOk());

		reorderAs(schoolA, id, first)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.studentIds")
						.value("The new order must contain exactly the route's current stops."));
	}

	@Test
	void reorderingWithAStudentNotOnThisRouteIsRejected() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));
		UUID onRoute = aStudent(schoolA);
		assignAs(schoolA, id, onRoute).andExpect(status().isOk());
		UUID notOnRoute = aStudent(schoolA);

		reorderAs(schoolA, id, onRoute, notOnRoute)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.studentIds")
						.value("The new order must contain exactly the route's current stops."));
	}

	@Test
	void reorderingAnUnknownOrOtherSchoolRouteIsNotFound() throws Exception {
		String id = createAs(schoolA, "Verdun morning run", aVehicle(schoolA, true), aDriver(schoolA));

		reorderAs(schoolA, UUID.randomUUID().toString()).andExpect(status().isNotFound());
		reorderAs(schoolB, id).andExpect(status().isNotFound());
	}

	// The Hamra morning run from docs/contracts/samples/routing (proposal.json), already
	// validated against these exact minute figures in RouteTimingsTests/OrToolsRouteOptimizerTests.
	// The school sits at (33.896, 35.484) in application-test.yml, matching the sample.
	private static final double[] RAMI = { 33.8995, 35.521 };
	private static final double[] SALMA = { 33.887, 35.488 };
	private static final double[] TAREK = { 33.905, 35.51 };
	private static final double[] DANA = { 33.891, 35.48 };

	@Test
	void stopsShowArrivalTimesComputedBackwardsFromSchoolArrival() throws Exception {
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		assignAs(schoolA, id, aStudentAt(schoolA, RAMI[0], RAMI[1])).andExpect(status().isOk());
		assignAs(schoolA, id, aStudentAt(schoolA, SALMA[0], SALMA[1])).andExpect(status().isOk());
		assignAs(schoolA, id, aStudentAt(schoolA, TAREK[0], TAREK[1])).andExpect(status().isOk());
		assignAs(schoolA, id, aStudentAt(schoolA, DANA[0], DANA[1])).andExpect(status().isOk());

		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.stops[0].arrivalTime").value("07:08"))
				.andExpect(jsonPath("$.stops[1].arrivalTime").value("07:15"))
				.andExpect(jsonPath("$.stops[2].arrivalTime").value("07:21"))
				.andExpect(jsonPath("$.stops[3].arrivalTime").value("07:28"));
	}

	@Test
	void arrivalTimesUpdateAfterReorder() throws Exception {
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		UUID rami = aStudentAt(schoolA, RAMI[0], RAMI[1]);
		UUID salma = aStudentAt(schoolA, SALMA[0], SALMA[1]);
		UUID tarek = aStudentAt(schoolA, TAREK[0], TAREK[1]);
		UUID dana = aStudentAt(schoolA, DANA[0], DANA[1]);
		assignAs(schoolA, id, rami).andExpect(status().isOk());
		assignAs(schoolA, id, salma).andExpect(status().isOk());
		assignAs(schoolA, id, tarek).andExpect(status().isOk());
		assignAs(schoolA, id, dana).andExpect(status().isOk());

		reorderAs(schoolA, id, rami, tarek, salma, dana)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.stops[0].arrivalTime").value("07:17"))
				.andExpect(jsonPath("$.stops[1].arrivalTime").value("07:20"))
				.andExpect(jsonPath("$.stops[2].arrivalTime").value("07:26"))
				.andExpect(jsonPath("$.stops[3].arrivalTime").value("07:28"));
	}

	@Test
	void unpinnedStopsHaveNoArrivalTimeAndAreSkippedForTheOthers() throws Exception {
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		assignAs(schoolA, id, aStudentWithNoPin(schoolA)).andExpect(status().isOk());
		assignAs(schoolA, id, aStudentAt(schoolA, DANA[0], DANA[1])).andExpect(status().isOk());

		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.stops[0].arrivalTime").isEmpty())
				.andExpect(jsonPath("$.stops[1].arrivalTime").value("07:28"));
	}

	@Test
	void noArrivalTimesWhenTheSchoolsArrivalTimeIsNotSet() throws Exception {
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		assignAs(schoolA, id, aStudentAt(schoolA, DANA[0], DANA[1])).andExpect(status().isOk());

		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.school.arrivalTime").isEmpty())
				.andExpect(jsonPath("$.stops[0].arrivalTime").isEmpty());
	}

	@Test
	void arrivalTimesAreAllNullWhenTheScheduleIsNotDrivable() throws Exception {
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		// 22 minutes of driving (see stopsShowArrivalTimesComputedBackwardsFromSchoolArrival): a
		// 06:05 arrival needs the first pickup at 05:43, before the 06:00 earliest pickup.
		setSchoolArrivalTime(schoolA, LocalTime.of(6, 5));
		assignAs(schoolA, id, aStudentAt(schoolA, RAMI[0], RAMI[1])).andExpect(status().isOk());
		assignAs(schoolA, id, aStudentAt(schoolA, SALMA[0], SALMA[1])).andExpect(status().isOk());
		assignAs(schoolA, id, aStudentAt(schoolA, TAREK[0], TAREK[1])).andExpect(status().isOk());

		mockMvc.perform(get(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(jsonPath("$.stops[0].arrivalTime").isEmpty())
				.andExpect(jsonPath("$.stops[1].arrivalTime").isEmpty())
				.andExpect(jsonPath("$.stops[2].arrivalTime").isEmpty());
	}

	// SCRUM-203: propose, apply and discard an optimized order. The optimizer and the straight-line
	// travel times are the real ones; the order it finds is not asserted, only what must hold for
	// any answer (same students, no worse than the current order, route untouched until apply).

	private List<UUID> assignFourStops(UUID schoolId, String routeId) throws Exception {
		List<UUID> ids = new java.util.ArrayList<>();
		for (double[] pin : new double[][] { RAMI, SALMA, TAREK, DANA }) {
			UUID studentId = aStudentAt(schoolId, pin[0], pin[1]);
			assignAs(schoolId, routeId, studentId).andExpect(status().isOk());
			ids.add(studentId);
		}
		return ids;
	}

	/** A route with the four sample stops in the sample's order and a 07:30 school arrival. */
	private String aRouteWithFourStops(List<UUID> ids) throws Exception {
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		ids.addAll(assignFourStops(schoolA, id));
		return id;
	}

	private org.springframework.test.web.servlet.ResultActions proposeAs(UUID schoolId, String routeId) throws Exception {
		return mockMvc.perform(post(URL + "/" + routeId + "/optimization")
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId)));
	}

	private String proposalIdOf(String routeId) throws Exception {
		String body = proposeAs(schoolA, routeId).andExpect(status().isCreated())
				.andExpect(jsonPath("$.feasible").value(true)).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	private org.springframework.test.web.servlet.ResultActions applyAs(UUID schoolId, String routeId, Object proposalId)
			throws Exception {
		return mockMvc.perform(post(URL + "/" + routeId + "/optimization/" + proposalId + "/apply")
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId)));
	}

	private org.springframework.test.web.servlet.ResultActions discardAs(UUID schoolId, String routeId,
			Object proposalId) throws Exception {
		return mockMvc.perform(delete(URL + "/" + routeId + "/optimization/" + proposalId)
				.with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolId)));
	}

	private List<String> stopIdsOf(String routeId) throws Exception {
		String body = mockMvc.perform(get(URL + "/" + routeId).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.stops[*].studentId");
	}

	private List<String> asStrings(List<UUID> ids) {
		return ids.stream().map(UUID::toString).toList();
	}

	/** Lowers the vehicle's capacity below the stops on the route, as the contract says can happen. */
	private void lowerCapacityTo(String routeId, int capacity) {
		UUID vehicleId = routeRepository.findById(UUID.fromString(routeId)).orElseThrow().getVehicleId();
		Vehicle vehicle = vehicleRepository.findById(vehicleId).orElseThrow();
		vehicle.setCapacity(capacity);
		vehicleRepository.save(vehicle);
	}

	@Test
	void proposingReturnsAnOrderWithArrivalTimesAndLeavesTheRouteUnchanged() throws Exception {
		List<UUID> ids = new java.util.ArrayList<>();
		String id = aRouteWithFourStops(ids);

		String body = proposeAs(schoolA, id).andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNotEmpty())
				.andExpect(jsonPath("$.feasible").value(true))
				.andExpect(jsonPath("$.reasons.length()").value(0))
				.andExpect(jsonPath("$.current.drivingMinutes").value(22))
				.andExpect(jsonPath("$.current.stops[0].arrivalTime").value("07:08"))
				.andExpect(jsonPath("$.current.stops[3].arrivalTime").value("07:28"))
				.andExpect(jsonPath("$.proposed.stops.length()").value(4))
				.andExpect(jsonPath("$.proposed.stops[0].position").value(1))
				.andExpect(jsonPath("$.proposed.stops[3].position").value(4))
				.andExpect(jsonPath("$.proposed.stops[3].arrivalTime").value("07:28"))
				.andReturn().getResponse().getContentAsString();

		List<String> proposedIds = JsonPath.read(body, "$.proposed.stops[*].studentId");
		assertEquals(java.util.Set.copyOf(asStrings(ids)), java.util.Set.copyOf(proposedIds));
		int proposedMinutes = JsonPath.read(body, "$.proposed.drivingMinutes");
		assertTrue(proposedMinutes <= 22, "the proposal is never worse than the current order");
		assertEquals(asStrings(ids), stopIdsOf(id));
		assertEquals(1, proposalRepository.count());
	}

	@Test
	void aLongOrderIsSavedAndAppliedWhole() throws Exception {
		String id = createAs(schoolA, "Big run", aVehicle(schoolA, true), aDriver(schoolA));
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		for (int i = 0; i < 8; i++) {
			assignAs(schoolA, id, aStudentAt(schoolA, 33.88 + i * 0.003, 35.49 + i * 0.002)).andExpect(status().isOk());
		}

		String proposalId = proposalIdOf(id);

		applyAs(schoolA, id, proposalId).andExpect(status().isOk())
				.andExpect(jsonPath("$.stops.length()").value(8));
		assertEquals(8, versionRepository.findAll().get(0).getStopOrder().size());
	}

	@Test
	void aRouteOverCapacityGetsAnInfeasibleProposalWithNothingSaved() throws Exception {
		String id = aRouteWithFourStops(new java.util.ArrayList<>());
		lowerCapacityTo(id, 3);

		proposeAs(schoolA, id).andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isEmpty())
				.andExpect(jsonPath("$.feasible").value(false))
				.andExpect(jsonPath("$.proposed").isEmpty())
				.andExpect(jsonPath("$.current.stops.length()").value(4))
				.andExpect(jsonPath("$.reasons[0].code").value("CAPACITY_EXCEEDED"));
		assertEquals(0, proposalRepository.count());
	}

	@Test
	void anUndrivableCurrentOrderShowsNoTimesButStillItsDrivingTotal() throws Exception {
		String id = aRouteWithFourStops(new java.util.ArrayList<>());
		// Same arrangement as arrivalTimesAreAllNullWhenTheScheduleIsNotDrivable: a 06:05 arrival
		// puts the first pickup before 06:00, so there are no times, but the legs still add up.
		schoolSettingsRepository.deleteAll();
		setSchoolArrivalTime(schoolA, LocalTime.of(6, 5));

		proposeAs(schoolA, id).andExpect(status().isCreated())
				.andExpect(jsonPath("$.feasible").value(false))
				.andExpect(jsonPath("$.reasons[0].code").value("ARRIVAL_TIME_UNREACHABLE"))
				.andExpect(jsonPath("$.current.drivingMinutes").value(22))
				.andExpect(jsonPath("$.current.stops[0].arrivalTime").isEmpty())
				.andExpect(jsonPath("$.current.stops[3].arrivalTime").isEmpty());
		assertEquals(0, proposalRepository.count());
	}

	@Test
	void proposingAgainReplacesThePendingProposal() throws Exception {
		String id = aRouteWithFourStops(new java.util.ArrayList<>());
		String first = proposalIdOf(id);
		String second = proposalIdOf(id);

		assertEquals(1, proposalRepository.count());
		applyAs(schoolA, id, first).andExpect(status().isNotFound());
		applyAs(schoolA, id, second).andExpect(status().isOk());
	}

	@Test
	void anInfeasibleProposeStillClearsTheEarlierProposal() throws Exception {
		String id = aRouteWithFourStops(new java.util.ArrayList<>());
		String first = proposalIdOf(id);
		lowerCapacityTo(id, 3);

		proposeAs(schoolA, id).andExpect(status().isCreated()).andExpect(jsonPath("$.feasible").value(false));

		applyAs(schoolA, id, first).andExpect(status().isNotFound());
	}

	@Test
	void aRouteWithNoStopsCannotBeOptimized() throws Exception {
		String id = createAs(schoolA, "Empty run", aVehicle(schoolA, true), aDriver(schoolA));
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));

		proposeAs(schoolA, id).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").isNotEmpty());
		assertEquals(0, proposalRepository.count());
	}

	@Test
	void aRouteCannotBeOptimizedBeforeTheSchoolsArrivalTimeIsSet() throws Exception {
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		assignAs(schoolA, id, aStudentAt(schoolA, RAMI[0], RAMI[1])).andExpect(status().isOk());

		proposeAs(schoolA, id).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("The school's arrival time is not set."));
	}

	@Test
	void stopsWithoutAPinAreNamedAndBlockOptimizing() throws Exception {
		String id = createAs(schoolA, "Hamra morning run", aVehicle(schoolA, true), aDriver(schoolA));
		setSchoolArrivalTime(schoolA, LocalTime.of(7, 30));
		assignAs(schoolA, id, aStudentAt(schoolA, RAMI[0], RAMI[1])).andExpect(status().isOk());
		UUID noPin = aStudentWithNoPin(schoolA);
		assignAs(schoolA, id, noPin).andExpect(status().isOk());

		proposeAs(schoolA, id).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("Hadi Rizk")))
				.andExpect(jsonPath("$.studentIds.length()").value(1))
				.andExpect(jsonPath("$.studentIds[0]").value(noPin.toString()));
	}

	@Test
	void anotherSchoolsOrUnknownRouteIsNotFoundForAllThreeEndpoints() throws Exception {
		String id = aRouteWithFourStops(new java.util.ArrayList<>());
		String proposalId = proposalIdOf(id);

		proposeAs(schoolB, id).andExpect(status().isNotFound());
		applyAs(schoolB, id, proposalId).andExpect(status().isNotFound());
		discardAs(schoolB, id, proposalId).andExpect(status().isNotFound());
		proposeAs(schoolA, UUID.randomUUID().toString()).andExpect(status().isNotFound());
		assertEquals(1, proposalRepository.count());
	}

	@Test
	void applyingMakesTheProposalTheRoutesOrderAndKeepsThePreviousOrderAsAVersion() throws Exception {
		List<UUID> ids = new java.util.ArrayList<>();
		String id = aRouteWithFourStops(ids);
		String body = proposeAs(schoolA, id).andReturn().getResponse().getContentAsString();
		String proposalId = JsonPath.read(body, "$.id");
		List<String> proposedIds = JsonPath.read(body, "$.proposed.stops[*].studentId");

		applyAs(schoolA, id, proposalId).andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(id))
				.andExpect(jsonPath("$.stops[3].arrivalTime").value("07:28"));

		assertEquals(proposedIds, stopIdsOf(id));
		assertEquals(0, proposalRepository.count());
		assertEquals(1, versionRepository.count());
		assertEquals(ids, versionRepository.findAll().get(0).getStopOrder());
	}

	@Test
	void aProposalCanOnlyBeAppliedOnce() throws Exception {
		String id = aRouteWithFourStops(new java.util.ArrayList<>());
		String proposalId = proposalIdOf(id);

		applyAs(schoolA, id, proposalId).andExpect(status().isOk());
		applyAs(schoolA, id, proposalId).andExpect(status().isNotFound());
		assertEquals(1, versionRepository.count());
	}

	@Test
	void aProposalFromAnotherRouteCannotBeApplied() throws Exception {
		String id = aRouteWithFourStops(new java.util.ArrayList<>());
		String proposalId = proposalIdOf(id);
		String other = createAs(schoolA, "Other run", aVehicle(schoolA, true), aDriver(schoolA));

		applyAs(schoolA, other, proposalId).andExpect(status().isNotFound());
		discardAs(schoolA, other, proposalId).andExpect(status().isNotFound());
		assertEquals(1, proposalRepository.count());
	}

	@Test
	void applyingAfterTheOrderWasChangedByHandIsAConflictAndKeepsTheProposal() throws Exception {
		List<UUID> ids = new java.util.ArrayList<>();
		String id = aRouteWithFourStops(ids);
		String proposalId = proposalIdOf(id);
		reorderAs(schoolA, id, ids.get(3), ids.get(2), ids.get(1), ids.get(0)).andExpect(status().isOk());

		applyAs(schoolA, id, proposalId).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").isNotEmpty());

		assertEquals(1, proposalRepository.count());
		assertEquals(0, versionRepository.count());
		assertEquals(asStrings(List.of(ids.get(3), ids.get(2), ids.get(1), ids.get(0))), stopIdsOf(id));
	}

	@Test
	void applyingAfterAStudentWasAddedIsAConflict() throws Exception {
		String id = aRouteWithFourStops(new java.util.ArrayList<>());
		String proposalId = proposalIdOf(id);
		assignAs(schoolA, id, aStudentAt(schoolA, 33.9, 35.5)).andExpect(status().isOk());

		applyAs(schoolA, id, proposalId).andExpect(status().isConflict());
	}

	@Test
	void discardingDropsTheProposalAndLeavesTheRouteUntouched() throws Exception {
		List<UUID> ids = new java.util.ArrayList<>();
		String id = aRouteWithFourStops(ids);
		String proposalId = proposalIdOf(id);

		discardAs(schoolA, id, proposalId).andExpect(status().isNoContent());

		assertEquals(0, proposalRepository.count());
		assertEquals(asStrings(ids), stopIdsOf(id));
		applyAs(schoolA, id, proposalId).andExpect(status().isNotFound());
		discardAs(schoolA, id, proposalId).andExpect(status().isNotFound());
		discardAs(schoolA, id, UUID.randomUUID()).andExpect(status().isNotFound());
	}

	@Test
	void deletingARouteDeletesItsProposalAndVersions() throws Exception {
		String id = aRouteWithFourStops(new java.util.ArrayList<>());
		applyAs(schoolA, id, proposalIdOf(id)).andExpect(status().isOk());
		proposalIdOf(id);
		assertEquals(1, proposalRepository.count());
		assertEquals(1, versionRepository.count());

		mockMvc.perform(delete(URL + "/" + id).with(loggedInAs(Role.HEAD_OF_TRANSPORT, schoolA)))
				.andExpect(status().isNoContent());

		assertEquals(0, proposalRepository.count());
		assertEquals(0, versionRepository.count());
	}

	@Test
	void nonHeadOfTransportRolesAreForbidden() throws Exception {
		for (Role role : new Role[] { Role.ADMIN, Role.DRIVER, Role.PARENT }) {
			mockMvc.perform(get(URL).with(loggedInAs(role, schoolA)))
					.andExpect(status().isForbidden());
		}
	}

	@Test
	void anonymousRequestsAreUnauthorized() throws Exception {
		mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
	}
}
