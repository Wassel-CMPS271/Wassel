package com.wassel.backend.parent.service;

import com.wassel.backend.parent.dto.ChildDriverResponse;
import com.wassel.backend.parent.dto.ChildResponse;
import com.wassel.backend.parent.dto.ChildRouteResponse;
import com.wassel.backend.parent.dto.ChildVehicleResponse;
import com.wassel.backend.routes.dto.ChildRouteInfo;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The signed-in parent's own children (SCRUM-240). Reaches {@code students} and {@code routes}
 * only through their service layer, never their repositories or entities.
 */
@Service
@RequiredArgsConstructor
public class ParentService {

	private final StudentService studentService;

	private final RouteService routeService;

	/** Every child linked to this parent, by first name. A parent with no children gets {@code []}. */
	@Transactional(readOnly = true)
	public List<ChildResponse> listChildren(UUID schoolId, UUID parentUserId) {
		return studentService.listChildrenOf(schoolId, parentUserId).stream()
				.map(student -> toChild(schoolId, student))
				.toList();
	}

	private ChildResponse toChild(UUID schoolId, StudentResponse student) {
		Optional<ChildRouteInfo> route = routeService.findRouteForChild(schoolId, student.id());
		if (route.isEmpty()) {
			return new ChildResponse(student.id(), student.firstName(), student.lastName(), null, null, null, null);
		}
		ChildRouteInfo info = route.get();
		return new ChildResponse(student.id(), student.firstName(), student.lastName(),
				new ChildRouteResponse(info.routeId(), info.routeName()),
				new ChildDriverResponse(info.driver().id(), info.driver().firstName(), info.driver().lastName(),
						info.driver().phone()),
				new ChildVehicleResponse(info.vehicle().id(), info.vehicle().plateNumber()),
				info.expectedPickupTime());
	}
}
