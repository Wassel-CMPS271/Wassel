package com.wassel.backend.roster.service;

import com.wassel.backend.routes.dto.BestRoutePlacementResponse;
import com.wassel.backend.routes.dto.BestRouteResponse;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.service.StudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.UUID;

/**
 * Roster changes that touch a student's route (SCRUM-270, docs/contracts/roster.md): pausing and archiving a student,
 * which takes them off their route, and placing a student on the best route. The school always comes from the
 * authenticated head of transportation. Nothing is stored here; the students and routes modules do the work.
 */
@Service
@RequiredArgsConstructor
public class RosterService {

	private final StudentService studentService;

	private final RouteService routeService;

	/**
	 * Gives the student this status. The change is checked first (404 for a student of another school, 409 for a change
	 * the rules refuse), so a refusal never takes anyone off a route. Pausing or archiving then takes them off their route
	 * (409 while they are on a bus today), in the same transaction as the new status: both happen or neither. The route's
	 * seat is free at once, and nothing in the runs, the confirmations or the attendance is touched, so the student's past
	 * stays as it was. Going back to active puts them on no route; the best-route insertion is how to place them again.
	 */
	@Transactional
	public StudentResponse changeStatus(UUID schoolId, UUID studentId, String status) {
		StudentStatus target = StudentStatus.valueOf(status.toUpperCase(Locale.ROOT));
		studentService.requireChange(schoolId, studentId, target);
		if (target != StudentStatus.ACTIVE) {
			routeService.releaseFromRoute(schoolId, studentId);
		}
		return studentService.changeStatus(schoolId, studentId, target);
	}

	public BestRouteResponse bestRoutes(UUID schoolId, UUID studentId) {
		return routeService.bestRoutes(schoolId, studentId);
	}

	public BestRoutePlacementResponse placeOnBestRoute(UUID schoolId, UUID studentId) {
		return routeService.placeOnBestRoute(schoolId, studentId);
	}
}
