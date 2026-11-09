package com.wassel.backend.common;

import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.vehicles.entity.Vehicle;
import com.wassel.backend.vehicles.repository.VehicleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;

/**
 * What the SCRUM-236 independent suites share: the real application on the PostgreSQL container (SCRUM-252), a clock
 * pinned to a Monday, a signed-in caller, and the rows a test needs. Suites write rows with their own random school
 * ids and never delete, because every test class shares one database. Assertions are on HTTP responses; a few expected
 * values (a driver's phone, a vehicle's plate) are read back from the repositories that built the rows.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(MondayClockConfig.class)
public abstract class CriteriaTestSupport {

	@Autowired
	protected MockMvc mockMvc;

	@Autowired
	protected MutableClock clock;

	@Autowired
	protected StudentRepository studentRepository;

	@Autowired
	protected VehicleRepository vehicleRepository;

	@Autowired
	protected DriverRepository driverRepository;

	@Autowired
	protected RouteRepository routeRepository;

	@BeforeEach
	void backToMonday() {
		clock.set(MondayClockConfig.MONDAY);
	}

	/**
	 * Runs the calls at the same instant (every thread waits at a barrier first) and returns what each answered, in the
	 * order given. For the race checks: a call returns the HTTP status of its request.
	 */
	protected static List<Integer> inParallel(List<Callable<Integer>> calls) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(calls.size());
		try {
			CyclicBarrier gate = new CyclicBarrier(calls.size());
			List<Future<Integer>> pending = new ArrayList<>();
			for (Callable<Integer> call : calls) {
				pending.add(pool.submit(() -> {
					gate.await();
					return call.call();
				}));
			}
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> answer : pending) {
				statuses.add(answer.get(60, TimeUnit.SECONDS));
			}
			return statuses;
		}
		finally {
			pool.shutdownNow();
		}
	}

	protected static RequestPostProcessor loggedInAs(Role role, UUID schoolId, UUID userId) {
		User user = User.builder().id(userId).email(role + "@wassel.test")
				.passwordHash("x").role(role).schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	/** A student with no route, linked to {@code parentUserId} (null for a student nobody is linked to). */
	protected Student child(UUID schoolId, UUID parentUserId, String firstName) {
		return studentRepository.save(Student.builder().schoolId(schoolId).firstName(firstName).lastName("Mansour")
				.grade("3").guardianName("Guardian " + firstName).guardianPhone("+961 3 100 100")
				.status(StudentStatus.ACTIVE).parentUserId(parentUserId).build());
	}

	protected Vehicle vehicle(UUID schoolId, int capacity) {
		return vehicleRepository.save(Vehicle.builder().schoolId(schoolId)
				.plateNumber("A " + (100000 + (int) (Math.random() * 900000))).capacity(capacity).active(true).build());
	}

	protected Driver driver(UUID schoolId, UUID userId, String firstName) {
		return driverRepository.save(Driver.builder().schoolId(schoolId).userId(userId)
				.firstName(firstName).lastName("Haddad").phone("+961 3 " + (100000 + (int) (Math.random() * 899999)))
				.email(UUID.randomUUID() + "@wassel.test").status(DriverStatus.ACTIVE).invitedAt(Instant.now())
				.build());
	}

	protected Route route(UUID schoolId, String name, Vehicle vehicle, Driver driver) {
		return routeRepository.save(Route.builder().schoolId(schoolId).name(name)
				.vehicleId(vehicle.getId()).driverId(driver.getId()).build());
	}

	/** A student at {@code position} on {@code route}, with a pin close to the school so stops get arrival times. */
	protected Student onRoute(UUID schoolId, UUID parentUserId, Route route, int position, String firstName) {
		return studentRepository.save(Student.builder().schoolId(schoolId).firstName(firstName).lastName("Mansour")
				.grade("3").guardianName("Guardian " + firstName).guardianPhone("+961 3 200 20" + position)
				.status(StudentStatus.ACTIVE).parentUserId(parentUserId).address(position + " Hamra Street")
				.latitude(new BigDecimal("33.90" + position)).longitude(new BigDecimal("35.49" + position))
				.routeId(route.getId()).stopPosition(position).build());
	}
}
