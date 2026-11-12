package com.wassel.backend.attendance.dto;

/** Which run of the day, as the attendance API shows it; mapped by name from {@code runs}' own enum, as {@link AttendanceStatus}. */
public enum AttendanceDirection {

	MORNING, AFTERNOON;

	/** The direction with the same name as {@code source}, which is {@code runs}' own enum (this module never imports it). */
	public static AttendanceDirection of(Enum<?> source) {
		return valueOf(source.name());
	}
}
