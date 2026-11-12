package com.wassel.backend.runs.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.common.WhileLocked;
import com.wassel.backend.routes.entity.Route;
import com.wassel.backend.routes.repository.RouteRepository;
import com.wassel.backend.runs.repository.RunRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * SCRUM-264, "no access leakage": a driver whose route is given to someone else while their request waits for the
 * run's row lock must get a 404, not write to the run. Each test holds the run's lock in another transaction, moves
 * the route to a spare driver, and lets the old driver's request through after the commit.
 */
class RunOwnershipRecheckTests extends RunCriteriaSupport {

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Autowired
	private RunRepository runRepository;

	@Autowired
	private RouteRepository routeRepository;

	/** Locks the run and gives the bus's route to a spare driver, as a reassignment that commits first would. */
	private Runnable reassignedWhileHoldingTheLock(Bus bus, String runId) {
		UUID spare = aDriverRecord(aDriverAccount());
		return () -> {
			runRepository.findLockedBySchoolIdAndId(school, UUID.fromString(runId)).orElseThrow();
			Route route = routeRepository.findBySchoolIdAndId(school, UUID.fromString(bus.routeId())).orElseThrow();
			route.setDriverId(spare);
			routeRepository.saveAndFlush(route);
		};
	}

	private Object morning(String field) throws Exception {
		return runField("MORNING", field);
	}

	private Object runField(String direction, String field) throws Exception {
		return ((List<?>) JsonPath.read(headRuns(null), "$.runs[?(@.direction == '" + direction + "')]." + field)).get(0);
	}

	@Test
	void aConfirmationFromTheOldDriverWaitingOnTheLockIsNotFoundAndWritesNothing() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = aStudent("Rami", null);
		onRoute(bus, rami);
		String runId = runId(bus, "MORNING");
		assertEquals(200, start(bus, runId).getStatus());

		MockHttpServletResponse answer = WhileLocked.send(transactionTemplate, reassignedWhileHoldingTheLock(bus, runId),
				() -> confirm(bus, runId, rami, "PICKED_UP"));

		assertEquals(404, answer.getStatus(), answer.getContentAsString());
		assertEquals(0, morning("counts.pickedUp"));
	}

	@Test
	void aStartFromTheOldDriverWaitingOnTheLockIsNotFoundAndTheRunStaysNotStarted() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");

		MockHttpServletResponse answer = WhileLocked.send(transactionTemplate, reassignedWhileHoldingTheLock(bus, runId),
				() -> start(bus, runId));

		assertEquals(404, answer.getStatus(), answer.getContentAsString());
		assertEquals("NOT_STARTED", morning("state"));
	}

	@Test
	void anEndFromTheOldDriverWaitingOnTheLockIsNotFoundAndTheRunStaysInProgress() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String runId = runId(bus, "MORNING");
		assertEquals(200, start(bus, runId).getStatus());

		MockHttpServletResponse answer = WhileLocked.send(transactionTemplate, reassignedWhileHoldingTheLock(bus, runId),
				() -> end(bus, runId));

		assertEquals(404, answer.getStatus(), answer.getContentAsString());
		assertEquals("IN_PROGRESS", morning("state"));
	}

	@Test
	void aStartOfTheAfternoonRunFromTheOldDriverWaitingOnTheLockIsNotFoundToo() throws Exception {
		Bus bus = aBus("Hamra morning run");
		String afternoon = runId(bus, "AFTERNOON");

		MockHttpServletResponse answer = WhileLocked.send(transactionTemplate, reassignedWhileHoldingTheLock(bus, afternoon),
				() -> start(bus, afternoon));

		assertEquals(404, answer.getStatus(), answer.getContentAsString());
		assertEquals("NOT_STARTED", runField("AFTERNOON", "state"));
	}
}
