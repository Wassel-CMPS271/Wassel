package com.wassel.backend.inbox.service;

import com.wassel.backend.runs.dto.WaitingStop;

import java.time.Duration;
import java.time.Instant;

/**
 * When a child still waiting counts as late (SCRUM-268, docs/contracts/inbox.md "Late alerts"). The bus is expected at
 * the stop at the live estimate when there is one (only a {@code LIVE} position gives one, and it is never before
 * {@code now}), and otherwise no earlier than {@code now}: the child has not been picked up yet, so that is all that is
 * certain. Late means the expected time is <b>after</b> the planned time plus the parent's minutes, so arriving exactly
 * that many minutes late is not late. A stale or missing position therefore never makes an alert by itself: only the
 * clock passing the planned time plus the minutes does, which is a delay that has happened, not one guessed from a
 * position.
 */
final class LateRule {

	private LateRule() {
	}

	static boolean isLate(WaitingStop stop, Instant now, int afterMinutes) {
		Instant expected = stop.estimatedAt() != null && stop.estimatedAt().isAfter(now) ? stop.estimatedAt() : now;
		return expected.isAfter(stop.plannedAt().plus(Duration.ofMinutes(afterMinutes)));
	}
}
