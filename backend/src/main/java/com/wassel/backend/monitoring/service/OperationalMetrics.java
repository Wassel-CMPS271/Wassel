package com.wassel.backend.monitoring.service;

import com.wassel.backend.monitoring.dto.MetricsResponse;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.concurrent.atomic.LongAdder;

/**
 * The few numbers that say whether the platform is healthy (SCRUM-290), counted in memory since the backend started:
 * requests, server errors, 429s, how long requests take, failed sign-ins, lockouts, and emails sent and failed. They
 * reset on every restart and redeploy and are not shared between instances, and the response says so.
 * <p>
 * A leaf module: it imports no other module, so {@code auth} and {@code inbox} can call it without a cycle.
 */
@Component
public class OperationalMetrics {

	/** How many of the latest request times the p95 is worked out from: bounded memory, and "recent" rather than "ever". */
	static final int LATENCY_SAMPLE = 2000;

	private final Instant since;

	private final LongAdder requests = new LongAdder();

	private final LongAdder serverErrors = new LongAdder();

	private final LongAdder tooManyRequests = new LongAdder();

	private final LongAdder failedSignIns = new LongAdder();

	private final LongAdder lockouts = new LongAdder();

	private final LongAdder notificationsSent = new LongAdder();

	private final LongAdder notificationsFailed = new LongAdder();

	private final long[] latencyNanos = new long[LATENCY_SAMPLE];

	private int latencyCount;

	private int latencyNext;

	public OperationalMetrics(Clock clock) {
		this.since = clock.instant();
	}

	/** One finished request: its status (500 when it ended in an exception) and how long it took. */
	public void request(int status, long nanos) {
		requests.increment();
		if (status >= 500) {
			serverErrors.increment();
		}
		else if (status == 429) {
			tooManyRequests.increment();
		}
		synchronized (latencyNanos) {
			latencyNanos[latencyNext] = Math.max(0, nanos);
			latencyNext = (latencyNext + 1) % LATENCY_SAMPLE;
			latencyCount = Math.min(latencyCount + 1, LATENCY_SAMPLE);
		}
	}

	public void signInFailed() {
		failedSignIns.increment();
	}

	public void accountLocked() {
		lockouts.increment();
	}

	public void notificationSent() {
		notificationsSent.increment();
	}

	public void notificationsFailed(long count) {
		notificationsFailed.add(count);
	}

	public MetricsResponse snapshot() {
		long total = requests.sum();
		long errors = serverErrors.sum();
		long sent = notificationsSent.sum();
		long failed = notificationsFailed.sum();
		long[] sample;
		synchronized (latencyNanos) {
			sample = Arrays.copyOf(latencyNanos, latencyCount);
		}
		return new MetricsResponse(since, true,
				new MetricsResponse.Requests(total, errors, total == 0 ? null : (double) errors / total,
						tooManyRequests.sum(), sample.length == 0 ? null : p95Millis(sample), sample.length),
				new MetricsResponse.SignIns(failedSignIns.sum(), lockouts.sum()),
				new MetricsResponse.Notifications(sent, failed,
						sent + failed == 0 ? null : (double) sent / (sent + failed)));
	}

	/** Nearest-rank 95th percentile, in whole milliseconds (rounded up, so a sub-millisecond request is 1). */
	static long p95Millis(long[] nanos) {
		long[] sorted = nanos.clone();
		Arrays.sort(sorted);
		int rank = (int) Math.ceil(0.95 * sorted.length);
		return (sorted[rank - 1] + 999_999) / 1_000_000;
	}
}
