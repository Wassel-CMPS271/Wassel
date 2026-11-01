package com.wassel.backend.absences.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.CriteriaTestSupport;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * KNOWN BUG in SCRUM-238 (merged): see docs/testing/SCRUM-236/SCRUM-236-bugs.md, BUG-1. Skipped by default because it
 * fails today. Run with {@code sh ./mvnw test -Dknown-bug.SCRUM-238-race=true -Dtest=AbsenceRaceCriteriaTests} and delete
 * the {@code @EnabledIfSystemProperty} line once it is fixed.
 *
 * <p>Criterion (contract, "Absences"): reporting is idempotent for an exact repeat and an overlap is a 409. Two reports
 * of the same child that arrive at the same instant are the case the PostgreSQL exclusion constraint exists for. What
 * must hold, whichever request wins: neither answers 5xx, at most one creates the absence (201), the other is a 200
 * (the repeat) or a 409 (an overlap, or a lost race the client may retry), and exactly one absence is stored.
 */
@EnabledIfSystemProperty(named = "known-bug.SCRUM-238-race", matches = "true",
		disabledReason = "KNOWN BUG in SCRUM-238 (SCRUM-236-bugs.md BUG-1). Run with -Dknown-bug.SCRUM-238-race=true")
class AbsenceRaceCriteriaTests extends CriteriaTestSupport {

	private static final int ROUNDS = 25;

	private final UUID school = UUID.randomUUID();

	private final UUID parent = UUID.randomUUID();

	private Student layla;

	@BeforeEach
	void aChild() {
		layla = child(school, parent, "Layla");
	}

	private int report(String from, String to) throws Exception {
		return mockMvc.perform(post("/api/parent/children/" + layla.getId() + "/absences")
						.with(loggedInAs(Role.PARENT, school, parent)).contentType(MediaType.APPLICATION_JSON)
						.content("{\"fromDate\":\"%s\",\"toDate\":\"%s\"}".formatted(from, to)))
				.andReturn().getResponse().getStatus();
	}

	private int storedBetween(String from, String to) throws Exception {
		String json = mockMvc.perform(get("/api/parent/children/" + layla.getId() + "/absences")
						.with(loggedInAs(Role.PARENT, school, parent)))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		List<java.util.Map<String, String>> all = JsonPath.read(json, "$");
		// ISO dates compare as text: an absence overlaps [from, to] when it starts by `to` and ends no earlier than `from`.
		return (int) all.stream().filter(a -> a.get("fromDate").compareTo(to) <= 0 && a.get("toDate").compareTo(from) >= 0).count();
	}

	/** The rules above, as a list of what went wrong in one round (empty when the round is fine). */
	private List<String> problems(List<Integer> statuses, int stored, boolean exactRepeat) {
		List<String> out = new ArrayList<>();
		long created = statuses.stream().filter(s -> s == 201).count();
		if (statuses.stream().anyMatch(s -> s >= 500)) {
			out.add("a request answered 5xx");
		}
		if (created != 1) {
			out.add(created + " requests created the absence");
		}
		if (statuses.stream().anyMatch(s -> s != 201 && s != 409 && !(exactRepeat && s == 200))) {
			out.add("unexpected status");
		}
		if (stored != 1) {
			out.add(stored + " absences stored");
		}
		return out;
	}

	@Test
	void twoIdenticalReportsAtTheSameTimeStoreOneAndNeverFail() throws Exception {
		List<String> bad = new ArrayList<>();
		for (int round = 0; round < ROUNDS; round++) {
			String day = LocalDate.of(2027, 1, 4).plusDays(7L * round).toString();
			List<Callable<Integer>> both = List.of(() -> report(day, day), () -> report(day, day));

			List<Integer> statuses = inParallel(both);

			List<String> problems = problems(statuses, storedBetween(day, day), true);
			if (!problems.isEmpty()) {
				bad.add(day + " " + statuses + ": " + problems);
			}
		}
		assertTrue(bad.isEmpty(), bad.size() + " of " + ROUNDS + " rounds wrong: " + bad);
	}

	@Test
	void twoOverlappingReportsAtTheSameTimeStoreOneAndNeverFail() throws Exception {
		List<String> bad = new ArrayList<>();
		for (int round = 0; round < ROUNDS; round++) {
			LocalDate start = LocalDate.of(2027, 3, 1).plusDays(7L * round);
			String a1 = start.toString();
			String a2 = start.plusDays(1).toString();
			String b1 = start.plusDays(1).toString();
			String b2 = start.plusDays(2).toString();
			List<Callable<Integer>> both = List.of(() -> report(a1, a2), () -> report(b1, b2));

			List<Integer> statuses = inParallel(both);

			List<String> problems = problems(statuses, storedBetween(a1, b2), false);
			if (!problems.isEmpty()) {
				bad.add(a1 + " " + statuses + ": " + problems);
			}
		}
		assertTrue(bad.isEmpty(), bad.size() + " of " + ROUNDS + " rounds wrong: " + bad);
	}
}
