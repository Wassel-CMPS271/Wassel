package com.wassel.backend.inbox.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.inbox.service.LateAlertService;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * SCRUM-268, "retries": a late alert that fails does not stop the others in the same call, and the next call makes it
 * without making any twice. The failure is a one-off error from the student lookup for one child. Its own class because
 * the spy gives it its own application context.
 */
class LateAlertRetryTests extends RunCriteriaSupport {

	@Autowired
	private LateAlertService lateAlertService;

	@MockitoSpyBean
	private StudentService studentService;

	private UUID student(String name, UUID parent, double latitude) {
		return studentRepository.save(Student.builder().schoolId(school).firstName(name).lastName("Nasr").grade("4")
				.guardianName("Guardian of " + name).guardianPhone("+961 3 " + (900000 + Math.abs(name.hashCode()) % 99999))
				.status(StudentStatus.ACTIVE).address(name + " Street, Beirut").latitude(BigDecimal.valueOf(latitude))
				.longitude(BigDecimal.valueOf(35.50)).parentUserId(parent).build()).getId();
	}

	private int lateEntries(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get("/api/parent/inbox").with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus());
		return ((List<?>) JsonPath.read(response.getContentAsString(), "$[?(@.type == 'LATE')]")).size();
	}

	@Test
	void aFailedAlertIsLoggedAndRetriedWhileTheOthersAreMadeOnce() throws Exception {
		UUID parentOfFirst = aParent();
		UUID parentOfSecond = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID first = student("Rami", parentOfFirst, 33.90);
		UUID second = student("Salma", parentOfSecond, 33.91);
		onRoute(bus, first, second);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		String route = send(get(ROUTES + "/" + bus.routeId()).with(head())).getContentAsString();
		LocalTime lastPlanned = LocalTime.parse(JsonPath.<List<String>>read(route,
				"$.stops[?(@.studentId == '" + second + "')].arrivalTime").get(0));
		setNow(WEDNESDAY, lastPlanned.plusMinutes(30));
		doThrow(new IllegalStateException("one-off database error")).doCallRealMethod().when(studentService)
				.getStudent(school, first);

		lateAlertService.raise();

		assertEquals(0, lateEntries(parentOfFirst), "this one failed");
		assertEquals(1, lateEntries(parentOfSecond), "and did not stop the next");

		lateAlertService.raise();

		assertEquals(1, lateEntries(parentOfFirst), "the next call makes it");
		assertEquals(1, lateEntries(parentOfSecond), "and does not make the other twice");
	}
}
