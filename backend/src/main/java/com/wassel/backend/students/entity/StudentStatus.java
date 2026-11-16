package com.wassel.backend.students.entity;

/**
 * Where a student stands with the school's transport (SCRUM-270, docs/contracts/roster.md). Only {@code ACTIVE} students
 * can be on a route. {@code PAUSED} is a transport pause: the student stays on the roster and comes back with
 * {@code ACTIVE}. {@code INACTIVE} is archived: they have left, and only a restore brings them back. The names are the
 * stored ones; {@code INACTIVE} kept its name so nothing that already reads it changes.
 */
public enum StudentStatus {
	ACTIVE,
	PAUSED,
	INACTIVE
}
