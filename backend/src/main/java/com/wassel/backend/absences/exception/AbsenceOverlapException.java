package com.wassel.backend.absences.exception;

/**
 * Thrown when a reported absence overlaps another, non-cancelled absence this child already has,
 * and the two aren't an exact repeat (an exact repeat is idempotent — see
 * {@code AbsenceService#reportAbsence} — and never reaches this exception). Always keyed by
 * {@code "fromDate"}, the field the contract names for this case; the message names the
 * conflicting absence's dates. Mapped to a 409.
 */
public class AbsenceOverlapException extends RuntimeException {

	public AbsenceOverlapException(String message) {
		super(message);
	}
}
