package com.wassel.backend.attendance.controller;

import com.wassel.backend.attendance.exception.InvalidAttendanceQueryException;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Spring quietly takes the first of a repeated query parameter ({@code ?from=a&from=b}). A history asked for with two
 * different {@code from}s has no single answer, so these endpoints refuse it instead of picking one.
 */
final class SingleValuedParameters {

	private SingleValuedParameters() {
	}

	/** A 400 against the first of these parameters that is given more than once. */
	static void require(HttpServletRequest request, String... names) {
		for (String name : names) {
			String[] values = request.getParameterValues(name);
			if (values != null && values.length > 1) {
				throw new InvalidAttendanceQueryException(name, name + " must be given once");
			}
		}
	}
}
