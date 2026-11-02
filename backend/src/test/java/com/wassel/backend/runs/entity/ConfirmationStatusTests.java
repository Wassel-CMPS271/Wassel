package com.wassel.backend.runs.entity;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * A student's latest confirmation is their highest status, and the rank is the declaration order: the counts, the
 * stops, the transition table and the move guard all compare statuses. Reordering the enum must fail here first.
 */
class ConfirmationStatusTests {

	@Test
	void theStatusesAreDeclaredInRankOrder() {
		assertEquals(List.of(ConfirmationStatus.NOT_PRESENT, ConfirmationStatus.PICKED_UP, ConfirmationStatus.DROPPED_OFF),
				List.of(ConfirmationStatus.values()));
	}
}
