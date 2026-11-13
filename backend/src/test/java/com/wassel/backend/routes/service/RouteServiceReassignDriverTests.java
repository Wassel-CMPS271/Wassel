package com.wassel.backend.routes.service;

import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.exception.RouteAssignmentConflictException;
import com.wassel.backend.routes.repository.RouteRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

/**
 * SCRUM-264: which database refusal of a driver change is a lost race. Only the driver's unique key can be one, since
 * only the driver is written; anything else must stay an unexpected error, never be reported as a vehicle problem.
 */
@ExtendWith(MockitoExtension.class)
class RouteServiceReassignDriverTests {

	private final UUID school = UUID.randomUUID();

	private final UUID routeId = UUID.randomUUID();

	private final DriverResponse current = driver("Karim");

	private final DriverResponse replacement = driver("Nadim");

	@Mock
	private RouteRepository routeRepository;

	@Mock
	private DriverService driverService;

	@InjectMocks
	private RouteService routeService;

	private static DriverResponse driver(String firstName) {
		return new DriverResponse(UUID.randomUUID(), firstName, "Haddad", "+961 3 000 000", firstName + "@wassel.test",
				"active", Instant.EPOCH, null);
	}

	private void theDatabaseRefusesTheWriteWith(DataIntegrityViolationException refusal) {
		Route route = Route.builder().id(routeId).schoolId(school).name("Hamra").vehicleId(UUID.randomUUID())
				.driverId(current.id()).build();
		when(routeRepository.findLockedBySchoolIdAndId(school, routeId)).thenReturn(Optional.of(route));
		when(routeRepository.findBySchoolIdAndDriverIdAndIdNot(school, replacement.id(), routeId))
				.thenReturn(Optional.empty());
		when(driverService.getOwnedDriver(school, current.id())).thenReturn(current);
		when(driverService.getOwnedDriver(school, replacement.id())).thenReturn(replacement);
		when(routeRepository.updateDriverId(school, routeId, replacement.id())).thenThrow(refusal);
	}

	@Test
	void aViolationOfTheDriversUniqueKeyIsAConflictOnTheDriverField() {
		theDatabaseRefusesTheWriteWith(new DataIntegrityViolationException(
				"ERROR: duplicate key value violates unique constraint \"uq_routes_school_driver\""));

		RouteAssignmentConflictException conflict = assertThrows(RouteAssignmentConflictException.class,
				() -> routeService.reassignDriver(school, routeId, current.id(), replacement.id()));

		assertEquals("driverId", conflict.getField());
		assertEquals("Driver is already on another route.", conflict.getMessage());
	}

	@Test
	void anyOtherViolationIsNotReportedAsAVehicleProblem() {
		DataIntegrityViolationException other = new DataIntegrityViolationException(
				"ERROR: insert or update violates foreign key constraint \"fk_other\"");
		theDatabaseRefusesTheWriteWith(other);

		DataIntegrityViolationException thrown = assertThrows(DataIntegrityViolationException.class,
				() -> routeService.reassignDriver(school, routeId, current.id(), replacement.id()));

		assertSame(other, thrown);
	}
}
