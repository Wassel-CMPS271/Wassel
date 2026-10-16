package com.wassel.backend.routes.controller;

import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.repository.RouteRepository;
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
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
	private VehicleRepository vehicleRepository;

	@Autowired
	private DriverRepository driverRepository;

	@Autowired
	private StudentRepository studentRepository;

	@BeforeEach
	void cleanDatabase() {
		routeRepository.deleteAll();
		driverRepository.deleteAll();
		vehicleRepository.deleteAll();
		studentRepository.deleteAll();
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
		Student student = studentRepository.save(Student.builder().schoolId(schoolId)
				.firstName("Hadi").lastName("Rizk").grade("5").guardianName("Guardian Name")
				.guardianPhone("0" + (int) (Math.random() * 100000000)).status(status)
				.address("Verdun Street, Beirut").latitude(BigDecimal.valueOf(33.886))
				.longitude(BigDecimal.valueOf(35.485)).build());
		return student.getId();
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
