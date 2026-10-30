package com.wassel.backend.absences.exception;

/**
 * Thrown when an absence id doesn't exist, isn't this student's, or is cancelled (which behaves
 * as "gone" everywhere — see {@code Absence#cancelled}). Mapped to a 404 by the global exception
 * handler. A studentId that isn't the signed-in parent's own child is a different, students-owned
 * 404 ({@code students.exception.StudentNotFoundException}), thrown by {@code AbsenceService}
 * itself, not this one.
 */
public class AbsenceNotFoundException extends RuntimeException {

	public AbsenceNotFoundException(String message) {
		super(message);
	}
}
