package com.wassel.backend.attendance.dto;

/**
 * A recorded status as the attendance API shows it, in the order of the journey: the highest one recorded is the
 * status of a row. The names are the ones {@code runs} stores; {@link #of} maps by name, so a name added there but
 * not here fails loudly (a 500) rather than showing a wrong status.
 */
public enum AttendanceStatus {

	NOT_PRESENT, PICKED_UP, DROPPED_OFF;

	/** The status with the same name as {@code source}, which is {@code runs}' own enum (this module never imports it). */
	public static AttendanceStatus of(Enum<?> source) {
		return valueOf(source.name());
	}
}
