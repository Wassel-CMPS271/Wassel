package com.wassel.backend.common;

import java.util.List;
import java.util.function.Predicate;

/**
 * SCRUM-266: the one switch behind the two suites that test SCRUM-268 (PR #158) before it is merged
 * ({@code NotificationPreferencesCriteriaTests}, {@code LateAlertCriteriaTests}). Use it as
 * {@code @EnabledIf("com.wassel.backend.common.Scrum268Gate#built")}.
 *
 * <p>The suites switch on when SCRUM-268's classes are on the classpath. A single probe class would skip both suites for
 * ever, with no failing signal, if #158 renamed or moved that class before merging. So the probe is every class #158 adds
 * in the inbox module: if some are there and others are not, {@link #built} throws and both suites fail loudly with the
 * list of what is missing, instead of skipping. {@code -Dpending.SCRUM-268=true} still forces them on (on plain
 * {@code develop} every test then fails, which shows the tests can fail).
 *
 * <p>Delete this class and the two {@code @EnabledIf} lines once #158 is merged, and check that both classes then report
 * "Skipped: 0" in the Surefire summary.
 */
public final class Scrum268Gate {

	/** Everything #158 adds to {@code com.wassel.backend.inbox}; all of them exist after the merge, none before. */
	static final List<String> CLASSES = List.of("com.wassel.backend.inbox.service.LateAlertService",
			"com.wassel.backend.inbox.service.LateRule", "com.wassel.backend.inbox.service.NotificationPreferenceService",
			"com.wassel.backend.inbox.entity.NotificationPreference",
			"com.wassel.backend.inbox.repository.NotificationPreferenceRepository");

	private Scrum268Gate() {
	}

	/** True when SCRUM-268 is built or forced on, false when none of it is; throws when only part of it is. */
	public static boolean built() {
		if (Boolean.getBoolean("pending.SCRUM-268")) {
			return true;
		}
		return decide(Scrum268Gate::onClasspath);
	}

	/** The decision, apart from the classpath so that it can be tested. */
	static boolean decide(Predicate<String> exists) {
		List<String> missing = CLASSES.stream().filter(name -> !exists.test(name)).toList();
		if (missing.isEmpty()) {
			return true;
		}
		if (missing.size() == CLASSES.size()) {
			return false;
		}
		throw new IllegalStateException("SCRUM-268 is only partly on the classpath, so the suites for it would skip or fail "
				+ "for the wrong reason: missing " + missing + ". Probably #158 renamed or moved a class: update "
				+ Scrum268Gate.class.getName() + ".CLASSES (or delete the gate if #158 is merged).");
	}

	private static boolean onClasspath(String name) {
		try {
			Class.forName(name, false, Scrum268Gate.class.getClassLoader());
			return true;
		}
		catch (ClassNotFoundException e) {
			return false;
		}
	}

}
