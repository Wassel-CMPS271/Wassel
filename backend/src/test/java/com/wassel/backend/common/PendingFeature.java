package com.wassel.backend.common;

/**
 * SCRUM-272: a suite for a feature whose pull request is still open must compile on {@code develop} and switch itself on
 * the day the feature merges, with no flag to remember. {@link #present} is true when the feature's own class is on the
 * classpath (the marker is a class the pull request adds, so it is not in {@code develop} until the merge), or when the
 * test run is started with {@code -Dpending.<ticket>=true}. Once on, a missing endpoint or field fails the test; it is
 * never skipped again. Delete the use of this class from a suite when its feature has merged.
 */
public final class PendingFeature {

	private PendingFeature() {
	}

	public static boolean present(String ticket, String markerClass) {
		if (Boolean.getBoolean("pending." + ticket)) {
			return true;
		}
		try {
			Class.forName(markerClass);
			return true;
		}
		catch (ClassNotFoundException e) {
			return false;
		}
	}
}
