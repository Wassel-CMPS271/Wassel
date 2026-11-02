package com.wassel.backend.common;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

/**
 * A {@link Clock} a test can move, for the code that needs "today in Asia/Beirut" (the daily runs, SCRUM-233).
 * Tests register one as a {@code @Primary} bean so the date never depends on the day CI happens to run.
 */
public class MutableClock extends Clock {

	private final ZoneId zone;

	private volatile Instant instant;

	public MutableClock(Instant instant, ZoneId zone) {
		this.instant = instant;
		this.zone = zone;
	}

	public void set(Instant instant) {
		this.instant = instant;
	}

	@Override
	public ZoneId getZone() {
		return zone;
	}

	@Override
	public Clock withZone(ZoneId zone) {
		return Clock.fixed(instant, zone);
	}

	@Override
	public Instant instant() {
		return instant;
	}
}
