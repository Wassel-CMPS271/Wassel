package com.wassel.backend.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Counts requests per key in fixed windows, in memory (SCRUM-288). The first request of a key opens a window; once
 * {@code limit} requests have been counted in it, the rest are refused until it ends. A fixed window lets a
 * client send up to twice the limit across the boundary of two windows, which is fine for slowing a script down.
 * <p>
 * Nothing is shared between backend instances and everything is lost on a restart.
 */
@Slf4j
@Component
public class RateLimiter {

	/** A safety cap for the map; past it new keys are let through unchecked rather than locking everyone out. */
	static final int MAX_KEYS = 100_000;

	/**
	 * The outcome of one request. {@code retryAfterSeconds} is only meaningful when it was refused, and
	 * {@code firstRefusal} is true for the first refused request of a window (used to log once, not per request).
	 */
	public record Decision(boolean allowed, long retryAfterSeconds, boolean firstRefusal) {
	}

	private record Window(long endsAtMillis, int count) {
	}

	private final Clock clock;

	private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

	private final AtomicLong nextPurgeMillis = new AtomicLong(0);

	public RateLimiter(Clock clock) {
		this.clock = clock;
	}

	public Decision tryAcquire(String key, int limit, Duration window) {
		long now = clock.millis();
		purgeIfDue(now, window);
		if (windows.size() >= MAX_KEYS && !windows.containsKey(key)) {
			log.warn("Rate limiter is holding {} keys; letting a new one through unchecked", windows.size());
			return new Decision(true, 0, false);
		}
		Window updated = windows.compute(key, (k, current) -> {
			if (current == null || current.endsAtMillis() <= now) {
				return new Window(now + window.toMillis(), 1);
			}
			return new Window(current.endsAtMillis(), current.count() + 1);
		});
		if (updated.count() <= limit) {
			return new Decision(true, 0, false);
		}
		long retryAfter = Math.max(1, (updated.endsAtMillis() - now + 999) / 1000);
		return new Decision(false, retryAfter, updated.count() == limit + 1);
	}

	private void purgeIfDue(long now, Duration window) {
		long due = nextPurgeMillis.get();
		if (now >= due && nextPurgeMillis.compareAndSet(due, now + window.toMillis())) {
			windows.values().removeIf(w -> w.endsAtMillis() <= now);
		}
	}

	int size() {
		return windows.size();
	}
}
