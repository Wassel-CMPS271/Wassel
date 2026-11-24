package com.wassel.backend.monitoring.dto;

import java.time.Instant;

/**
 * What the admin reads (docs/contracts/admin-metrics.md). Every number counts from {@code since}, the moment the
 * backend started; {@code resetsOnRestart} is always true and is there so nobody reads them as lifetime totals.
 * A rate is null while there is nothing to divide by.
 */
public record MetricsResponse(Instant since, boolean resetsOnRestart, Requests requests, SignIns signIns,
		Notifications notifications) {

	/**
	 * {@code serverErrors} are the answers with a 5xx status, and {@code errorRate} is their share of all requests.
	 * {@code p95Millis} is the 95th percentile of the last {@code latencySample} requests (at most 2,000).
	 * The health check and this endpoint are not counted.
	 */
	public record Requests(long total, long serverErrors, Double errorRate, long tooManyRequests, Long p95Millis,
			int latencySample) {
	}

	/** {@code failed}: a wrong or unknown password (401 on login) or a wrong code (400 on verify). {@code lockouts}: accounts locked. */
	public record SignIns(long failed, long lockouts) {
	}

	/** Emails that went out, and deliveries that ended failed (gave up, expired or interrupted). */
	public record Notifications(long sent, long failed, Double successRate) {
	}
}
