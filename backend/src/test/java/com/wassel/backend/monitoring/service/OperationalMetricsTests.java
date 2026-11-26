package com.wassel.backend.monitoring.service;

import com.wassel.backend.common.MutableClock;
import com.wassel.backend.monitoring.dto.MetricsResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** SCRUM-290: the numbers are exactly what was counted, worked out by hand from a scripted run. */
class OperationalMetricsTests {

	private static final Instant START = Instant.parse("2026-11-23T08:00:00Z");

	private OperationalMetrics metrics;

	@BeforeEach
	void setUp() {
		metrics = new OperationalMetrics(new MutableClock(START, ZoneOffset.UTC));
	}

	private static long ms(long millis) {
		return millis * 1_000_000;
	}

	@Test
	void nothingCountedYetHasZerosAndNoRatesAndSaysItResetsOnRestart() {
		MetricsResponse snapshot = metrics.snapshot();
		assertEquals(START, snapshot.since());
		assertEquals(true, snapshot.resetsOnRestart());
		assertEquals(0, snapshot.requests().total());
		assertNull(snapshot.requests().errorRate());
		assertNull(snapshot.requests().p95Millis());
		assertEquals(0, snapshot.requests().latencySample());
		assertNull(snapshot.notifications().successRate());
	}

	@Test
	void aScriptedRunGivesTheNumbersWorkedOutByHand() {
		// 20 requests: 17 fine, 1 refused (429), 2 server errors. Times 1..20 ms.
		for (int i = 1; i <= 17; i++) {
			metrics.request(i % 2 == 0 ? 200 : 404, ms(i));
		}
		metrics.request(429, ms(18));
		metrics.request(500, ms(19));
		metrics.request(503, ms(20));
		metrics.signInFailed();
		metrics.signInFailed();
		metrics.signInFailed();
		metrics.accountLocked();
		for (int i = 0; i < 8; i++) {
			metrics.notificationSent();
		}
		metrics.notificationsFailed(2);

		MetricsResponse snapshot = metrics.snapshot();
		assertEquals(20, snapshot.requests().total());
		assertEquals(2, snapshot.requests().serverErrors());
		assertEquals(0.1, snapshot.requests().errorRate(), 1e-9);
		assertEquals(1, snapshot.requests().tooManyRequests());
		// Nearest rank: ceil(0.95 * 20) = 19th of the sorted times = 19 ms.
		assertEquals(19, snapshot.requests().p95Millis());
		assertEquals(20, snapshot.requests().latencySample());
		assertEquals(3, snapshot.signIns().failed());
		assertEquals(1, snapshot.signIns().lockouts());
		assertEquals(8, snapshot.notifications().sent());
		assertEquals(2, snapshot.notifications().failed());
		assertEquals(0.8, snapshot.notifications().successRate(), 1e-9);
	}

	@Test
	void a429IsNotAServerErrorAndAServerErrorIsNotA429() {
		metrics.request(429, ms(1));
		metrics.request(500, ms(1));
		MetricsResponse snapshot = metrics.snapshot();
		assertEquals(1, snapshot.requests().tooManyRequests());
		assertEquals(1, snapshot.requests().serverErrors());
	}

	@Test
	void p95IsRoundedUpToAWholeMillisecondAndASingleRequestIsItsOwnP95() {
		metrics.request(200, 1_000);
		assertEquals(1, metrics.snapshot().requests().p95Millis());
		assertEquals(95, OperationalMetrics.p95Millis(IntStream.rangeClosed(1, 100).mapToLong(i -> ms(i)).toArray()));
	}

	@Test
	void p95IgnoresTheOrderTheRequestsCameIn() {
		for (int i = 20; i >= 1; i--) {
			metrics.request(200, ms(i));
		}
		assertEquals(19, metrics.snapshot().requests().p95Millis());
	}

	@Test
	void p95LooksAtTheLatestRequestsOnlyButTheCountsKeepEverything() {
		for (int i = 0; i < OperationalMetrics.LATENCY_SAMPLE; i++) {
			metrics.request(200, ms(5000));
		}
		for (int i = 0; i < OperationalMetrics.LATENCY_SAMPLE; i++) {
			metrics.request(200, ms(10));
		}
		MetricsResponse snapshot = metrics.snapshot();
		assertEquals(10, snapshot.requests().p95Millis());
		assertEquals(OperationalMetrics.LATENCY_SAMPLE, snapshot.requests().latencySample());
		assertEquals(2L * OperationalMetrics.LATENCY_SAMPLE, snapshot.requests().total());
	}

	@Test
	void parallelCountingLosesNothing() {
		IntStream.range(0, 10_000).parallel().forEach(i -> {
			metrics.request(i % 10 == 0 ? 500 : 200, ms(1));
			metrics.signInFailed();
		});
		MetricsResponse snapshot = metrics.snapshot();
		assertEquals(10_000, snapshot.requests().total());
		assertEquals(1_000, snapshot.requests().serverErrors());
		assertEquals(10_000, snapshot.signIns().failed());
	}
}
