package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.routes.service.RouteService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.time.LocalTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * SCRUM-264: the day turning over while a reassignment is in progress. A spy on {@link RouteService} moves the clock
 * past midnight right after the driver is changed, so the answer is built on the next day, exactly as a request
 * that straddles midnight would. Kept apart from {@link RunReassignmentTests} because a spy gives the test class its
 * own application context.
 */
class RunReassignmentDayTurnoverTests extends RunCriteriaSupport {

	@MockitoSpyBean
	private RouteService routeService;

	@Test
	void aDayThatTurnsOverAfterTheChangeStillAnswersWithTheRunThatWasChanged() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		UUID spare = aDriverRecord(aDriverAccount());
		User head = userRepository.save(User.builder().email("head-" + UUID.randomUUID() + "@wassel.test")
				.passwordHash("x").role(Role.HEAD_OF_TRANSPORT).schoolId(school).build());
		doAnswer(call -> {
			Object changed = call.callRealMethod();
			setNow(WEDNESDAY.plusDays(1), LocalTime.of(0, 5));
			return changed;
		}).when(routeService).reassignDriver(any(), any(), any(), any());

		MockHttpServletResponse answer = send(post(HEAD_RUNS + "/" + runId + "/reassignments")
				.with(as(Role.HEAD_OF_TRANSPORT, head.getId())).contentType(MediaType.APPLICATION_JSON)
				.content("{\"driverId\":\"%s\",\"fromDriverId\":\"%s\"}".formatted(spare, bus.driverId())));

		assertEquals(201, answer.getStatus(), answer.getContentAsString());
		assertEquals(runId, JsonPath.read(answer.getContentAsString(), "$.id"));
		assertEquals(spare.toString(), JsonPath.read(answer.getContentAsString(), "$.driver.id"));
		MockHttpServletResponse list = send(get(HEAD_RUNS + "/" + runId + "/reassignments").with(head()));
		assertEquals(1, (int) JsonPath.read(list.getContentAsString(), "$.length()"));
	}
}
