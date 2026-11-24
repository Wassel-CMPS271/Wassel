package com.wassel.backend.auth.service;

import com.wassel.backend.auth.service.RateLimiter.Decision;
import com.wassel.backend.common.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** SCRUM-288: the fixed-window counter behind the sign-in limit. */
class RateLimiterTests {

	private static final Duration WINDOW = Duration.ofMinutes(1);

	private MutableClock clock;

	private RateLimiter limiter;

	@BeforeEach
	void setUp() {
		clock = new MutableClock(Instant.parse("2026-11-23T08:00:00Z"), ZoneOffset.UTC);
		limiter = new RateLimiter(clock);
	}

	@Test
	void allowsUpToTheLimitThenRefusesWithTheTimeLeft() {
		for (int i = 0; i < 3; i++) {
			assertTrue(limiter.tryAcquire("login:a", 3, WINDOW).allowed());
		}
		clock.set(clock.instant().plusSeconds(20));
		Decision refused = limiter.tryAcquire("login:a", 3, WINDOW);
		assertFalse(refused.allowed());
		assertEquals(40, refused.retryAfterSeconds());
	}

	@Test
	void roundsTheWaitUpAndNeverAnswersZero() {
		for (int i = 0; i < 3; i++) {
			limiter.tryAcquire("login:a", 2, WINDOW);
		}
		clock.set(clock.instant().plusMillis(59_100));
		assertEquals(1, limiter.tryAcquire("login:a", 2, WINDOW).retryAfterSeconds());
	}

	@Test
	void onlyTheFirstRefusalOfAWindowIsMarkedForLogging() {
		limiter.tryAcquire("login:a", 1, WINDOW);
		assertTrue(limiter.tryAcquire("login:a", 1, WINDOW).firstRefusal());
		assertFalse(limiter.tryAcquire("login:a", 1, WINDOW).firstRefusal());
		assertFalse(limiter.tryAcquire("login:a", 1, WINDOW).firstRefusal());
	}

	@Test
	void theWindowEndsByItselfAndCountsAgain() {
		limiter.tryAcquire("login:a", 1, WINDOW);
		assertFalse(limiter.tryAcquire("login:a", 1, WINDOW).allowed());
		clock.set(clock.instant().plus(WINDOW));
		assertTrue(limiter.tryAcquire("login:a", 1, WINDOW).allowed());
		assertFalse(limiter.tryAcquire("login:a", 1, WINDOW).allowed());
	}

	@Test
	void keysAreCountedSeparately() {
		limiter.tryAcquire("login:a", 1, WINDOW);
		assertFalse(limiter.tryAcquire("login:a", 1, WINDOW).allowed());
		assertTrue(limiter.tryAcquire("login:b", 1, WINDOW).allowed());
		assertTrue(limiter.tryAcquire("logout:a", 1, WINDOW).allowed());
	}

	@Test
	void expiredKeysAreForgottenSoTheMapDoesNotGrowForever() {
		for (int i = 0; i < 50; i++) {
			limiter.tryAcquire("login:" + i, 5, WINDOW);
		}
		assertEquals(50, limiter.size());
		clock.set(clock.instant().plus(WINDOW).plusSeconds(1));
		limiter.tryAcquire("login:fresh", 5, WINDOW);
		assertEquals(1, limiter.size());
	}

	@Test
	void parallelRequestsNeverGetMoreThanTheLimit() {
		AtomicInteger allowed = new AtomicInteger();
		IntStream.range(0, 400).parallel().forEach(i -> {
			if (limiter.tryAcquire("login:a", 25, WINDOW).allowed()) {
				allowed.incrementAndGet();
			}
		});
		assertEquals(25, allowed.get());
	}

	@Test
	void pastTheKeyCapNewKeysPassUncheckedButKnownOnesStayLimited() {
		for (int i = 0; i < RateLimiter.MAX_KEYS; i++) {
			limiter.tryAcquire("k" + i, 1, WINDOW);
		}
		assertEquals(RateLimiter.MAX_KEYS, limiter.size());
		assertTrue(limiter.tryAcquire("one-too-many", 1, WINDOW).allowed());
		assertTrue(limiter.tryAcquire("one-too-many", 1, WINDOW).allowed());
		assertEquals(RateLimiter.MAX_KEYS, limiter.size());
		assertFalse(limiter.tryAcquire("k0", 1, WINDOW).allowed());
	}
}
