package com.wassel.backend.attendance.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.runs.entity.Confirmation;
import com.wassel.backend.runs.entity.ConfirmationStatus;
import com.wassel.backend.runs.entity.Run;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.runs.entity.RunState;
import com.wassel.backend.runs.repository.ConfirmationRepository;
import com.wassel.backend.runs.repository.RunRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * SCRUM-265: a page and its total come from one snapshot. A tap recorded by someone else between the page query and
 * the count query must not make {@code total} differ from the rows the pages add up to. Its own class because the hook
 * on the repository gives it its own application context.
 */
class AttendanceSnapshotTests extends RunCriteriaSupport {

	private static final String RANGE = "from=2026-11-02&to=2026-11-04";

	/** Runs just before the count query of a page, in the request's transaction; a test sets it, and it is cleared after. */
	private static volatile Runnable beforeCount = () -> { };

	/** Wraps the repository so a test can do something between a page query and its count query. */
	@TestConfiguration
	static class CountHook {

		@Bean
		static BeanPostProcessor countHook() {
			return new BeanPostProcessor() {
				@Override
				public Object postProcessAfterInitialization(Object bean, String name) {
					if (!(bean instanceof ConfirmationRepository)) {
						return bean;
					}
					return Proxy.newProxyInstance(ConfirmationRepository.class.getClassLoader(),
							new Class<?>[] { ConfirmationRepository.class }, (proxy, method, args) -> {
								if (method.getName().equals("countAttendanceRows")
										|| method.getName().equals("countAuditRows")) {
									beforeCount.run();
								}
								try {
									return method.invoke(bean, args);
								}
								catch (InvocationTargetException e) {
									throw e.getCause();
								}
							});
				}
			};
		}
	}

	@Autowired
	private ConfirmationRepository confirmationRepository;

	@AfterEach
	void clearTheHook() {
		beforeCount = () -> { };
	}

	@Autowired
	private RunRepository runRepository;

	private UUID run;

	private void seedOneTap() throws Exception {
		Bus bus = aBus("Hamra morning run");
		run = runRepository.save(Run.builder().schoolId(school).routeId(UUID.fromString(bus.routeId()))
				.runDate(LocalDate.of(2026, 11, 2)).direction(RunDirection.MORNING).state(RunState.FINISHED).build())
				.getId();
		tapIn(aStudent("First", null));
	}

	private void tapIn(UUID student) {
		confirmationRepository.save(Confirmation.builder().schoolId(school).runId(run).studentId(student)
				.status(ConfirmationStatus.PICKED_UP).confirmedAt(Instant.parse("2026-11-02T05:00:00Z")).build());
	}

	/** Someone else's request, in its own transaction, commits one more tap. */
	private void aTapCommitsFromAnotherThread() throws Exception {
		UUID late = aStudent("Late", null);
		ExecutorService other = Executors.newSingleThreadExecutor();
		try {
			other.submit(() -> tapIn(late)).get();
		}
		finally {
			other.shutdown();
		}
	}

	private void aTapCommitsFromAnotherThreadUnchecked() {
		try {
			aTapCommitsFromAnotherThread();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	@Test
	void theRowsTotalMatchesItsPageWhenATapIsRecordedBetweenTheTwoQueries() throws Exception {
		seedOneTap();
		beforeCount = this::aTapCommitsFromAnotherThreadUnchecked;

		MockHttpServletResponse response = send(MockMvcRequestBuilders
				.get("/api/head-of-transport/attendance?" + RANGE).with(head()));

		assertEquals(200, response.getStatus(), response.getContentAsString());
		assertEquals((int) JsonPath.read(response.getContentAsString(), "$.items.length()"),
				(int) JsonPath.read(response.getContentAsString(), "$.total"));
	}

	@Test
	void theAuditTotalMatchesItsPageWhenATapIsRecordedBetweenTheTwoQueries() throws Exception {
		seedOneTap();
		beforeCount = this::aTapCommitsFromAnotherThreadUnchecked;

		MockHttpServletResponse response = send(MockMvcRequestBuilders
				.get("/api/head-of-transport/attendance/audit?" + RANGE).with(head()));

		assertEquals(200, response.getStatus(), response.getContentAsString());
		assertEquals((int) JsonPath.read(response.getContentAsString(), "$.items.length()"),
				(int) JsonPath.read(response.getContentAsString(), "$.total"));
	}

	@Test
	void aParentsHistoryRunsNoCountQuery() throws Exception {
		UUID parent = aParent();
		UUID child = aStudent("Tarek", parent);
		Bus bus = aBus("Hamra morning run");
		run = runRepository.save(Run.builder().schoolId(school).routeId(UUID.fromString(bus.routeId()))
				.runDate(LocalDate.of(2026, 11, 2)).direction(RunDirection.MORNING).state(RunState.FINISHED).build())
				.getId();
		tapIn(child);
		AtomicInteger counts = new AtomicInteger();
		beforeCount = counts::incrementAndGet;

		MockHttpServletResponse response = send(MockMvcRequestBuilders
				.get("/api/parent/children/" + child + "/attendance?" + RANGE).with(as(
						com.wassel.backend.users.entity.Role.PARENT, parent)));

		assertEquals(200, response.getStatus(), response.getContentAsString());
		assertEquals(1, (int) JsonPath.read(response.getContentAsString(), "$.length()"));
		assertEquals(0, counts.get());
	}
}
