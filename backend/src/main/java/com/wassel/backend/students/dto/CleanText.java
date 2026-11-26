package com.wassel.backend.students.dto;

/**
 * The one trim for student text, used by single create and by import so the two never disagree (SCRUM-300). It removes
 * what {@code String.trim()} leaves: the non-breaking space (U+00A0) and any other Unicode space (via {@code strip()}),
 * and the byte-order mark (U+FEFF) that Excel and Word exports put in front of a cell.
 */
public final class CleanText {

	private static final char BYTE_ORDER_MARK = '﻿';

	private static final char NO_BREAK_SPACE = ' ';

	private CleanText() {
	}

	public static String of(String value) {
		if (value == null) {
			return null;
		}
		return value.replace(String.valueOf(BYTE_ORDER_MARK), "").replace(NO_BREAK_SPACE, ' ').strip();
	}
}
