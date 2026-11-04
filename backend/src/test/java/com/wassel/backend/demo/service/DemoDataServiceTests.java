package com.wassel.backend.demo.service;

import com.wassel.backend.demo.config.DemoDataSeeder;
import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.geocoding.service.Geocoder;
import com.wassel.backend.schools.dto.SchoolTimesResponse;
import com.wassel.backend.schools.service.SchoolSettingsService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.service.UserService;
import com.wassel.backend.vehicles.service.VehicleService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
class DemoDataServiceTests {

	// Saving a student's address geocodes it; without this every demo address would be a real, throttled
	// request to Nominatim. The demo pins are placed by hand afterwards, so no lookup result matters here.
	@MockitoBean
	private Geocoder geocoder;

	private static final String PASSWORD = "a-long-enough-demo-password";

	// Demo emails are unique across the platform, so every test seeds the same school.
	private static final UUID SCHOOL = UUID.randomUUID();

	@Autowired
	private DemoDataService demoDataService;

	@Autowired
	private UserService userService;

	@Autowired
	private VehicleService vehicleService;

	@Autowired
	private DriverService driverService;

	@Autowired
	private StudentService studentService;

	@Autowired
	private SchoolSettingsService schoolSettingsService;

	@Autowired
	private ApplicationContext context;

	@Test
	void seedsTheSchoolWithAccountsFleetAndStudents() {
		demoDataService.seed(SCHOOL, PASSWORD);

		assertTrue(userService.findByEmail(demoDataService.headOfTransportEmail()).isPresent());
		assertEquals(Role.PARENT, userService.findByEmail(demoDataService.parentEmail()).orElseThrow().getRole());
		assertEquals(3, vehicleService.listVehicles(SCHOOL).size());
		List<DriverResponse> drivers = driverService.listDrivers(SCHOOL);
		assertEquals(3, drivers.size());
		assertTrue(drivers.stream().allMatch(d -> d.assignedVehicleId() != null && "active".equals(d.status())));
		List<StudentResponse> students = studentService.listStudents(SCHOOL, null, null, null, null);
		assertEquals(10, students.size());
		assertTrue(students.stream().allMatch(s -> s.address() != null && s.latitude() != null));
		assertEquals(2, students.stream().filter(s -> s.parentUserId() != null).count());
		SchoolTimesResponse times = schoolSettingsService.getTimes(SCHOOL);
		assertEquals(LocalTime.of(8, 0), times.arrivalTime());
		assertEquals(LocalTime.of(14, 30), times.dismissalTime());
	}

	@Test
	void runningTwiceCreatesNoDuplicates() {
		demoDataService.seed(SCHOOL, PASSWORD);
		demoDataService.seed(SCHOOL, PASSWORD);

		assertEquals(3, vehicleService.listVehicles(SCHOOL).size());
		assertEquals(3, driverService.listDrivers(SCHOOL).size());
		assertEquals(10, studentService.listStudents(SCHOOL, null, null, null, null).size());
	}

	@Test
	void listsEveryAccountItCreatesSoTheGuardCanRecogniseThem() {
		demoDataService.seed(SCHOOL, PASSWORD);

		List<String> owned = demoDataService.demoEmails();

		assertEquals(5, owned.size());
		assertTrue(owned.contains(demoDataService.headOfTransportEmail()));
		assertTrue(owned.contains(demoDataService.parentEmail()));
		driverService.listDrivers(SCHOOL).forEach(driver -> assertTrue(owned.contains(driver.email())));
	}

	@Test
	void theSeederDoesNotExistUnlessDemoDataIsEnabled() {
		assertTrue(context.getBeansOfType(DemoDataSeeder.class).isEmpty());
	}
}
