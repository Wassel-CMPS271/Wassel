package com.wassel.backend.runs.service;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-264, the rule that keeps reassignment safe as other tickets add driver writes (SCRUM-261 location sharing,
 * SCRUM-263 offline replay): a driver's request reads their route before it takes the run's row lock, so a reassignment
 * that commits while it waits must be noticed after the lock. {@code RunService.lockOwnedRun} does that; a write that
 * locks the run any other way, or not at all, lets the old driver write to a run that is no longer theirs.
 *
 * <p>The rule is checked on the source of {@code RunService}, because what it forbids is a call that is missing or in
 * the wrong place, which no request can show. The checks are in {@link #violations}, and the second half of this class
 * runs them on the code the two open pull requests add (copied from their diffs), so the checker itself is proved to
 * catch the mistakes it exists for. When one of those pull requests is merged, a failing test here names the line to
 * change.
 */
class DriverWritesRecheckOwnershipTests {

	private static final Path RUN_SERVICE = Path.of("src/main/java/com/wassel/backend/runs/service/RunService.java");

	private static final Path DRIVER_CONTROLLER = Path
			.of("src/main/java/com/wassel/backend/runs/controller/DriverRunController.java");

	/**
	 * Public methods taking the driver that need no {@code lockOwnedRun}, each with why. Adding one is a decision to
	 * review: it must either not write, or write in one statement that itself requires the driver's own consent row.
	 */
	private static final Map<String, String> NO_LOCK_NEEDED = Map.of(
			"driverDay", "a read (it only creates today's missing run rows, which belong to no driver)",
			"recordLocation", "one conditional update that matches only a row the driver is sharing; safe only while "
					+ "reassign withdraws sharing, which violations() also requires");

	private static final Pattern METHOD = Pattern.compile(
			"(?m)^\\t(public |private |protected )?(static )?[\\w<>\\[\\], ?.]+ (\\w+)\\(([^)]*)\\)[^{;]*\\{");

	/** The source without comments and string literals, so braces and names in them are not read as code. */
	private static String code(String source) {
		return source.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("//[^\\n]*", "")
				.replaceAll("\"(\\\\.|[^\"\\\\])*\"", "\"\"");
	}

	private record Method(String name, boolean isPublic, String parameters, String body) {
	}

	private static List<Method> methodsOf(String source) {
		String code = code(source);
		List<Method> methods = new ArrayList<>();
		Matcher found = METHOD.matcher(code);
		while (found.find()) {
			int depth = 1;
			int end = found.end();
			while (depth > 0 && end < code.length()) {
				char c = code.charAt(end++);
				depth += c == '{' ? 1 : c == '}' ? -1 : 0;
			}
			methods.add(new Method(found.group(3), "public ".equals(found.group(1)), found.group(4),
					code.substring(found.end(), end)));
		}
		return methods;
	}

	private static String bodiesOf(List<Method> methods, String... names) {
		List<String> wanted = List.of(names);
		return methods.stream().filter(method -> wanted.contains(method.name())).map(Method::body)
				.reduce("", String::concat);
	}

	/** The names of the methods that take the owned lock, directly or by calling another method of the class that does. */
	private static Set<String> lockers(List<Method> methods) {
		Set<String> names = new HashSet<>();
		boolean grew = true;
		while (grew) {
			grew = false;
			for (Method method : methods) {
				boolean locks = method.body().contains("lockOwnedRun(")
						|| names.stream().anyMatch(name -> Pattern.compile("(?<![\\w.])" + name + "\\(").matcher(method.body()).find());
				grew |= locks && names.add(method.name());
			}
		}
		return names;
	}

	/** What is wrong with this {@code RunService} source, one sentence each; empty when the rule holds. */
	private static List<String> violations(String runServiceSource) {
		List<Method> methods = methodsOf(runServiceSource);
		List<String> problems = new ArrayList<>();
		Set<String> locking = lockers(methods);
		for (Method method : methods) {
			if (!method.name().equals("lockOwnedRun") && method.body().contains("findLockedBySchoolIdAndId(")) {
				problems.add(method.name() + " locks a run with findLockedBySchoolIdAndId, which skips the check that "
						+ "the route is still the driver's. Use lockOwnedRun(schoolId, today, route, runId).");
			}
			if (method.isPublic() && method.parameters().startsWith("User driver")
					&& !NO_LOCK_NEEDED.containsKey(method.name()) && !locking.contains(method.name())) {
				problems.add(method.name() + " is a driver's request that never calls lockOwnedRun, so a reassignment "
						+ "that commits while it runs is not noticed. Call it first in the transaction, or add the "
						+ "method to NO_LOCK_NEEDED with the reason.");
			}
		}
		String code = code(runServiceSource);
		if (code.contains("runLocationRepository") && !bodiesOf(methods, "reassign", "reassignLocked")
				.contains("stopSharing(")) {
			problems.add("reassign does not call runLocationRepository.stopSharing, so the old driver's position "
					+ "would stay on the run (docs/contracts/runs.md, Reassigning a run's driver).");
		}
		if (code.contains("confirmationKeyRepository")) {
			String confirm = bodiesOf(methods, "confirm");
			int lock = confirm.indexOf("lockOwnedRun(");
			int key = confirm.indexOf("confirmationKeyRepository");
			if (lock < 0 || (key >= 0 && key < lock)) {
				problems.add("confirm looks up the client request key before lockOwnedRun, so a replay from a "
						+ "reassigned driver would be answered 200 instead of 404.");
			}
		}
		return problems;
	}

	private static String read(Path file) throws IOException {
		return Files.readString(file);
	}

	@Test
	void everyDriverWriteInRunServiceRechecksOwnershipAfterTheLock() throws IOException {
		assertEquals(List.of(), violations(read(RUN_SERVICE)));
	}

	@Test
	void theCheckerReadsTheRealServiceNotAnEmptyFile() throws IOException {
		List<String> names = methodsOf(read(RUN_SERVICE)).stream().map(Method::name).toList();
		assertTrue(names.containsAll(List.of("start", "end", "confirm", "move", "lockOwnedRun", "reassign",
				"reassignLocked")), names.toString());
	}

	@Test
	void theDriverControllerReachesRunsOnlyThroughRunService() throws IOException {
		assertTrue(!code(read(DRIVER_CONTROLLER)).contains("Repository"),
				"A driver endpoint that reads or writes runs through a repository skips lockOwnedRun.");
	}

	// ---------------------------------------------------------------- the checker on what the open PRs add

	private static final String SERVICE_TOP = """
			public class RunService {
				private Run lockOwnedRun(UUID schoolId, LocalDate today, DriverRouteResponse route, UUID runId) {
					Run locked = runRepository.findLockedBySchoolIdAndId(schoolId, runId).orElseThrow();
					return locked;
				}
				public RunResponse confirm(User driver, UUID runId, UUID studentId, ConfirmationStatus status) {
					Run locked = lockOwnedRun(schoolId, today, route, runId);
					return null;
				}
			""";

	/** SCRUM-261 (#143) as its diff has it: the run is locked directly and the driver is never re-checked. */
	private static final String SET_SHARING_OF_143 = """
				public RunResponse setSharing(User driver, UUID runId, boolean enabled) {
					Run run = transactionTemplate.execute(tx -> {
						Run locked = runRepository.findLockedBySchoolIdAndId(schoolId, runId)
								.filter(found -> found.getRouteId().equals(route.id()) && found.getRunDate().equals(today))
								.orElseThrow(RunService::runNotFound);
						runLocationRepository.startSharing(schoolId, runId, route.driver().id());
						return locked;
					});
					return driverAnswer(run, route, dayType);
				}
			""";

	private static final String RECORD_LOCATION_OF_143 = """
				public void recordLocation(User driver, UUID runId, LocationRequest request) {
					Run run = todaysRun(schoolId, today, routeId, runId).orElseThrow(RunService::runNotFound);
					transactionTemplate.execute(tx -> runLocationRepository.savePosition(schoolId, runId, driverId));
				}
			""";

	private static final String REASSIGN_WITHOUT_STOP = """
				public Reassigned reassign(User head, UUID runId, ReassignRunRequest request) {
					return transactionTemplate.execute(tx -> reassignLocked(head, routeId, runId, today, request));
				}
				private boolean reassignLocked(User head, UUID routeId, UUID runId, LocalDate today, ReassignRunRequest r) {
					return routeService.reassignDriver(schoolId, routeId, from, to).changed();
				}
			""";

	private static final String REASSIGN_WITH_STOP = REASSIGN_WITHOUT_STOP.replace("return routeService",
			"runLocationRepository.stopSharing(schoolId, runId);\n\t\t\t\treturn routeService");

	/** SCRUM-263 (#155) as its diff has it: the key is looked up right after the 404 check, which is the lock. */
	private static final String CONFIRM_OF_155_KEY_FIRST = """
				public RunResponse confirm(User driver, UUID runId, UUID studentId, ConfirmationStatus status, UUID key) {
					Run run = transactionTemplate.execute(tx -> {
						Run locked = runRepository.findLockedBySchoolIdAndId(schoolId, runId).orElseThrow();
						Optional<ConfirmationKey> used = confirmationKeyRepository.findBySchoolIdAndDriverUserIdAndClientRequestId(schoolId, id, key);
						return locked;
					});
					return null;
				}
			""";

	private static final String CONFIRM_WITH_KEY_AFTER_LOCK = """
				public RunResponse confirm(User driver, UUID runId, UUID studentId, ConfirmationStatus status, UUID key) {
					Run run = transactionTemplate.execute(tx -> {
						Run locked = lockOwnedRun(schoolId, today, route, runId);
						Optional<ConfirmationKey> used = confirmationKeyRepository.findBySchoolIdAndDriverUserIdAndClientRequestId(schoolId, id, key);
						return locked;
					});
					return null;
				}
			""";

	private static String service(String... members) {
		return SERVICE_TOP + String.join("\n", members) + "}\n";
	}

	@Test
	void aSetSharingThatLocksTheRunDirectlyIsCaughtTwice() {
		List<String> problems = violations(service(SET_SHARING_OF_143, REASSIGN_WITH_STOP));
		assertEquals(2, problems.size(), problems.toString());
		assertTrue(problems.get(0).startsWith("setSharing locks a run with findLockedBySchoolIdAndId"));
		assertTrue(problems.get(1).startsWith("setSharing is a driver's request that never calls lockOwnedRun"));
	}

	@Test
	void aSetSharingThroughLockOwnedRunPassesButTheLocationNeedsReassignToWithdrawSharing() {
		String fixed = SET_SHARING_OF_143.replace("runRepository.findLockedBySchoolIdAndId(schoolId, runId)",
				"lockOwnedRun(schoolId, today, route, runId)");
		List<String> withoutStop = violations(service(fixed, RECORD_LOCATION_OF_143, REASSIGN_WITHOUT_STOP));
		assertEquals(1, withoutStop.size(), withoutStop.toString());
		assertTrue(withoutStop.get(0).startsWith("reassign does not call runLocationRepository.stopSharing"));
		assertEquals(List.of(), violations(service(fixed, RECORD_LOCATION_OF_143, REASSIGN_WITH_STOP)));
	}

	@Test
	void aReplayThatLooksUpItsKeyBeforeTheOwnershipCheckIsCaught() {
		// the old overload of confirm in SERVICE_TOP has the lock and no key; the key overload is the one tested
		String top = SERVICE_TOP.replaceAll("(?s)\\tpublic RunResponse confirm.*?\\n\\t}\\n", "");
		List<String> problems = violations(top + CONFIRM_OF_155_KEY_FIRST + "}\n");
		assertTrue(problems.stream().anyMatch(problem -> problem.startsWith("confirm looks up the client request key")),
				problems.toString());
		assertEquals(List.of(), violations(top + CONFIRM_WITH_KEY_AFTER_LOCK + "}\n"));
	}

	@Test
	void aDriverMethodThatNeverLocksIsCaughtButTheListedReadsAreNot() {
		String write = "\tpublic RunResponse pause(User driver, UUID runId) {\n\t\trunRepository.markPaused(runId);\n\t\treturn null;\n\t}\n";
		String read = "\tpublic RunsDayResponse driverDay(User driver) {\n\t\treturn null;\n\t}\n";
		assertEquals(1, violations(service(write)).size());
		assertEquals(List.of(), violations(service(read)));
	}
}
