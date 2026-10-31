package com.wassel.backend.parent.service;

import com.wassel.backend.parent.dto.ChildDriverResponse;
import com.wassel.backend.parent.dto.ChildResponse;
import com.wassel.backend.parent.dto.ChildRouteResponse;
import com.wassel.backend.parent.dto.ChildVehicleResponse;
import com.wassel.backend.routes.dto.ChildRouteInfo;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.runs.dto.ChildOnRoute;
import com.wassel.backend.runs.dto.ChildRunResponse;
import com.wassel.backend.runs.service.RunService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The signed-in parent's own children (SCRUM-240) and today's run for each (SCRUM-237). Reaches
 * {@code students}, {@code routes} and {@code runs} only through their service layer, never their
 * repositories or entities. Every id handed to {@code routes} and {@code runs} comes out of
 * {@code listChildrenOf}, so a parent only ever gets their own children. Both lookups are batched over all the
 * children, so the work grows with the number of routes, not children.
 */
@Service
@RequiredArgsConstructor
public class ParentService {

	private final StudentService studentService;

	private final RouteService routeService;

	private final RunService runService;

	/** Every child linked to this parent, by first name. A parent with no children gets {@code []}. */
	@Transactional(readOnly = true)
	public List<ChildResponse> listChildren(UUID schoolId, UUID parentUserId) {
		List<StudentResponse> children = studentService.listChildrenOf(schoolId, parentUserId);
		Map<UUID, ChildRouteInfo> routes = routeService.findRoutesForChildren(schoolId,
				children.stream().map(StudentResponse::id).toList());
		Map<UUID, ChildRunResponse> runs = runService.todayRunStatus(schoolId, routes.entrySet().stream()
				.map(entry -> new ChildOnRoute(entry.getKey(), entry.getValue().routeId())).toList());
		return children.stream().map(child -> toChild(child, routes.get(child.id()), runs.get(child.id()))).toList();
	}

	private ChildResponse toChild(StudentResponse student, ChildRouteInfo route, ChildRunResponse todayRun) {
		if (route == null) {
			return new ChildResponse(student.id(), student.firstName(), student.lastName(), null, null, null, null,
					null);
		}
		return new ChildResponse(student.id(), student.firstName(), student.lastName(),
				new ChildRouteResponse(route.routeId(), route.routeName()),
				new ChildDriverResponse(route.driver().id(), route.driver().firstName(), route.driver().lastName(),
						route.driver().phone()),
				new ChildVehicleResponse(route.vehicle().id(), route.vehicle().plateNumber()),
				route.expectedPickupTime(), todayRun);
	}
}
