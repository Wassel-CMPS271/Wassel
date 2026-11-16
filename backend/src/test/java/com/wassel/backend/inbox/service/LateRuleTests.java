package com.wassel.backend.inbox.service;

import com.wassel.backend.runs.dto.WaitingStop;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-268: the late rule at its edges, with no Spring and no database. "Late" is strictly after the planned time plus
 * the parent's minutes, so a bus exactly that many minutes late is not late and one second more is.
 */
class LateRuleTests {

	private static final Instant PLANNED = Instant.parse("2026-11-04T05:20:00Z");

	private static WaitingStop stop(Instant plannedAt, Instant estimatedAt) {
		return new WaitingStop(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), plannedAt, estimatedAt);
	}

	@Test
	void withNoEstimateOnlyTheClockCounts_andExactlyTheMinutesIsNotLate() {
		WaitingStop waiting = stop(PLANNED, null);

		assertFalse(LateRule.isLate(waiting, PLANNED.minusSeconds(600), 10), "long before the plan");
		assertFalse(LateRule.isLate(waiting, PLANNED, 10), "at the plan");
		assertFalse(LateRule.isLate(waiting, PLANNED.plusSeconds(599), 10), "one second inside the ten minutes");
		assertFalse(LateRule.isLate(waiting, PLANNED.plusSeconds(600), 10), "exactly ten minutes after");
		assertTrue(LateRule.isLate(waiting, PLANNED.plusSeconds(601), 10), "one second beyond");
	}

	@Test
	void theLiveEstimateCanMakeItLateBeforeTheClockDoes() {
		Instant now = PLANNED.minusSeconds(300);

		assertFalse(LateRule.isLate(stop(PLANNED, PLANNED.plusSeconds(600)), now, 10), "expected exactly ten minutes late");
		assertTrue(LateRule.isLate(stop(PLANNED, PLANNED.plusSeconds(601)), now, 10), "expected a second more");
		assertFalse(LateRule.isLate(stop(PLANNED, PLANNED.minusSeconds(60)), now, 10), "expected early");
	}

	@Test
	void anEstimateBeforeNowIsNeverTrustedOverTheClock() {
		// The estimate is made never earlier than the read, but the rule must not depend on that.
		Instant now = PLANNED.plusSeconds(601);

		assertTrue(LateRule.isLate(stop(PLANNED, PLANNED.minusSeconds(60)), now, 10));
	}

	@Test
	void theBoundaryMovesWithTheParentsMinutes() {
		WaitingStop waiting = stop(PLANNED, null);
		Instant sixMinutesAndASecond = PLANNED.plusSeconds(6 * 60 + 1);

		assertTrue(LateRule.isLate(waiting, sixMinutesAndASecond, 5));
		assertTrue(LateRule.isLate(waiting, sixMinutesAndASecond, 6));
		assertFalse(LateRule.isLate(waiting, sixMinutesAndASecond, 7));
		assertFalse(LateRule.isLate(waiting, PLANNED.plusSeconds(3600), 60), "exactly an hour");
		assertTrue(LateRule.isLate(waiting, PLANNED.plusSeconds(3601), 60));
	}

	@Test
	void thePlannedMomentIsTheSchoolsLocalTime_soASummerDayIsAnHourEarlierInUtcThanAWinterDay() {
		ZoneId beirut = ZoneId.of("Asia/Beirut");
		Instant winter = LocalDate.of(2026, 11, 4).atTime(LocalTime.of(7, 20)).atZone(beirut).toInstant();
		Instant summer = LocalDate.of(2026, 7, 1).atTime(LocalTime.of(7, 20)).atZone(beirut).toInstant();

		assertTrue(winter.equals(Instant.parse("2026-11-04T05:20:00Z")), "UTC+2 in November");
		assertTrue(summer.equals(Instant.parse("2026-07-01T04:20:00Z")), "UTC+3 in July");
		// The same local 07:30 is late by ten minutes on both days, though the UTC moments differ.
		assertFalse(LateRule.isLate(stop(winter, null), Instant.parse("2026-11-04T05:30:00Z"), 10));
		assertTrue(LateRule.isLate(stop(winter, null), Instant.parse("2026-11-04T05:30:01Z"), 10));
		assertFalse(LateRule.isLate(stop(summer, null), Instant.parse("2026-07-01T04:30:00Z"), 10));
		assertTrue(LateRule.isLate(stop(summer, null), Instant.parse("2026-07-01T04:30:01Z"), 10));
	}
}
