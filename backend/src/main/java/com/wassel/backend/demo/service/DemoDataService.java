package com.wassel.backend.demo.service;

import com.wassel.backend.drivers.dto.AssignVehicleRequest;
import com.wassel.backend.drivers.dto.CreateDriverRequest;
import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.schools.dto.SchoolTimesRequest;
import com.wassel.backend.schools.dto.SchoolTimesResponse;
import com.wassel.backend.schools.service.SchoolSettingsService;
import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.LinkParentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.dto.UpdateStudentAddressRequest;
import com.wassel.backend.students.dto.UpdateStudentLocationRequest;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import com.wassel.backend.vehicles.dto.CreateVehicleRequest;
import com.wassel.backend.vehicles.dto.VehicleResponse;
import com.wassel.backend.vehicles.service.VehicleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Creates the demo school's data. Every step first looks for what it would create and skips it
 * if it is there, so running this twice (or after a partial failure) adds nothing twice. A
 * school that already has times set keeps them.
 */
@Slf4j
@Service
public class DemoDataService {

	private static final String PARENT_GUARDIAN = "Maya Mansour";

	private record DemoVehicle(String plateNumber, int capacity) {
	}

	private record DemoDriver(String firstName, String lastName, String phone, String plateNumber) {

		String tag() {
			return "driver-" + firstName.toLowerCase();
		}
	}

	private record DemoStudent(String firstName, String lastName, String grade, String guardianName,
			String guardianPhone, String address, String latitude, String longitude) {
	}

	private static final List<DemoVehicle> VEHICLES = List.of(
			new DemoVehicle("B 101101", 14),
			new DemoVehicle("B 202202", 14),
			new DemoVehicle("B 303303", 20));

	private static final List<DemoDriver> DRIVERS = List.of(
			new DemoDriver("Karim", "Haddad", "+961 3 100 101", "B 101101"),
			new DemoDriver("Nadia", "Khoury", "+961 70 200 202", "B 202202"),
			new DemoDriver("Rami", "Saade", "+961 71 300 303", "B 303303"));

	// Pickup pins around Beirut, within a few kilometres of the school (33.896, 35.484).
	private static final List<DemoStudent> STUDENTS = List.of(
			new DemoStudent("Lea", "Mansour", "Grade 3", PARENT_GUARDIAN, "+961 3 400 401",
					"Hamra Street, Beirut", "33.8959", "35.4818"),
			new DemoStudent("Jad", "Mansour", "Grade 6", PARENT_GUARDIAN, "+961 3 400 401",
					"Hamra Street, Beirut", "33.8959", "35.4818"),
			new DemoStudent("Sara", "Nassar", "Grade 2", "Elie Nassar", "+961 70 410 411",
					"Sodeco Square, Achrafieh, Beirut", "33.8840", "35.5160"),
			new DemoStudent("Omar", "Fakhoury", "Grade 4", "Rima Fakhoury", "+961 71 420 421",
					"Mar Mikhael, Beirut", "33.8935", "35.5260"),
			new DemoStudent("Tala", "Rizk", "Grade 5", "Fadi Rizk", "+961 3 430 431",
					"Badaro, Beirut", "33.8740", "35.5120"),
			new DemoStudent("Ziad", "Abboud", "Grade 1", "Nour Abboud", "+961 76 440 441",
					"Corniche El Mazraa, Beirut", "33.8750", "35.5050"),
			new DemoStudent("Maya", "Salameh", "Grade 6", "Joe Salameh", "+961 3 450 451",
					"Ras Beirut, near the AUB gate", "33.9000", "35.4800"),
			new DemoStudent("Hadi", "Chahine", "Grade 3", "Dalal Chahine", "+961 70 460 461",
					"Verdun Street, Beirut", "33.8960", "35.4900"),
			new DemoStudent("Rita", "Tabet", "Grade 2", "Sami Tabet", "+961 71 470 471",
					"Furn El Chebbak, Beirut", "33.8650", "35.5200"),
			new DemoStudent("Karl", "Daou", "Grade 4", "Lina Daou", "+961 3 480 481",
					"Gemmayzeh, Beirut", "33.8950", "35.5170"));

	private final UserService userService;

	private final VehicleService vehicleService;

	private final DriverService driverService;

	private final StudentService studentService;

	private final SchoolSettingsService schoolSettingsService;

	private final String emailLocalPart;

	private final String emailDomain;

	/**
	 * Demo accounts are the base address with a tag added before the {@code @}
	 * ({@code demo+head@example.com}). Mail providers like Gmail deliver every tag to the base
	 * mailbox, so on a deployed environment, where sign-in emails a code, setting the base to a
	 * real mailbox lets the demo accounts receive theirs.
	 */
	public DemoDataService(UserService userService, VehicleService vehicleService, DriverService driverService,
			StudentService studentService, SchoolSettingsService schoolSettingsService,
			@Value("${wassel.demo.email-base:demo@wassel.local}") String emailBase) {
		int at = emailBase.lastIndexOf('@');
		if (at < 1 || at == emailBase.length() - 1) {
			throw new IllegalStateException("DEMO_EMAIL_BASE must be an email address like demo@example.com");
		}
		this.userService = userService;
		this.vehicleService = vehicleService;
		this.driverService = driverService;
		this.studentService = studentService;
		this.schoolSettingsService = schoolSettingsService;
		this.emailLocalPart = emailBase.substring(0, at).trim();
		this.emailDomain = emailBase.substring(at).trim();
	}

	public String headOfTransportEmail() {
		return emailFor("head");
	}

	public String parentEmail() {
		return emailFor("parent");
	}

	private String emailFor(String tag) {
		return (emailLocalPart + "+" + tag + emailDomain).toLowerCase();
	}

	/** Every email this seeder owns, for the guard that stops it running on real data. */
	public List<String> demoEmails() {
		return Stream.concat(Stream.of(headOfTransportEmail(), parentEmail()),
				DRIVERS.stream().map(driver -> emailFor(driver.tag()))).toList();
	}

	public void seed(UUID schoolId, String password) {
		ensureAccount(headOfTransportEmail(), Role.HEAD_OF_TRANSPORT, schoolId, password);
		User parent = ensureAccount(parentEmail(), Role.PARENT, schoolId, password);
		ensureSchoolTimes(schoolId);
		ensureVehicles(schoolId);
		ensureDrivers(schoolId, password);
		ensureStudents(schoolId, parent);
		log.info("Demo data is in place for school {}", schoolId);
	}

	private User ensureAccount(String email, Role role, UUID schoolId, String password) {
		return userService.findByEmail(email)
				.orElseGet(() -> userService.createUser(email, password, role, schoolId));
	}

	private void ensureSchoolTimes(UUID schoolId) {
		SchoolTimesResponse times = schoolSettingsService.getTimes(schoolId);
		if (times.arrivalTime() == null && times.dismissalTime() == null) {
			schoolSettingsService.updateTimes(schoolId,
					new SchoolTimesRequest(LocalTime.of(8, 0), LocalTime.of(14, 30)));
		}
	}

	private void ensureVehicles(UUID schoolId) {
		List<VehicleResponse> existing = vehicleService.listVehicles(schoolId);
		for (DemoVehicle vehicle : VEHICLES) {
			if (existing.stream().noneMatch(v -> v.plateNumber().equalsIgnoreCase(vehicle.plateNumber()))) {
				vehicleService.addVehicle(schoolId, new CreateVehicleRequest(vehicle.plateNumber(), vehicle.capacity()));
			}
		}
	}

	private void ensureDrivers(UUID schoolId, String password) {
		List<VehicleResponse> vehicles = vehicleService.listVehicles(schoolId);
		for (DemoDriver demo : DRIVERS) {
			DriverResponse driver = driverService.listDrivers(schoolId).stream()
					.filter(d -> d.email().equalsIgnoreCase(emailFor(demo.tag())))
					.findFirst()
					.orElseGet(() -> driverService.addActiveDriver(schoolId,
							new CreateDriverRequest(demo.firstName(), demo.lastName(), demo.phone(),
									emailFor(demo.tag())),
							password));
			if (driver.assignedVehicleId() == null) {
				vehicles.stream()
						.filter(v -> v.plateNumber().equalsIgnoreCase(demo.plateNumber()))
						.findFirst()
						.ifPresent(v -> driverService.assignToVehicle(schoolId, driver.id(),
								new AssignVehicleRequest(v.id())));
			}
		}
	}

	private void ensureStudents(UUID schoolId, User parent) {
		for (DemoStudent demo : STUDENTS) {
			StudentResponse student = studentService.listStudents(schoolId, null, null, null, null).stream()
					.filter(s -> s.firstName().equalsIgnoreCase(demo.firstName())
							&& s.lastName().equalsIgnoreCase(demo.lastName())
							&& s.guardianPhone().equals(demo.guardianPhone()))
					.findFirst()
					// No address here: the exact pin is set by hand just below, same as a real admin
					// correcting one. Geocoding a real address here would mean seeding depends on a
					// live Nominatim call for every demo student, every time the app starts.
					.orElseGet(() -> studentService.addStudent(schoolId, new CreateStudentRequest(demo.firstName(),
							demo.lastName(), demo.grade(), demo.guardianName(), demo.guardianPhone(), null)));
			if (student.address() == null) {
				studentService.updateAddress(schoolId, student.id(), new UpdateStudentAddressRequest(demo.address()));
			}
			if (student.latitude() == null) {
				studentService.updateLocation(schoolId, student.id(), new UpdateStudentLocationRequest(
						new BigDecimal(demo.latitude()), new BigDecimal(demo.longitude())));
			}
			if (student.parentUserId() == null && demo.guardianName().equals(PARENT_GUARDIAN)) {
				studentService.linkParent(schoolId, student.id(), new LinkParentRequest(parent.getId()));
			}
		}
	}
}
