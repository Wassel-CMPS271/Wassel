package independent.scrum295;

import com.wassel.backend.monitoring.config.RequestMetricsFilter;
import com.wassel.backend.monitoring.service.OperationalMetrics;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import static org.junit.jupiter.api.Assertions.*;

/** Independent SCRUM-295 assertions from admin-metrics.md, not the author's tests. */
class IndependentRequestMetricsCriteriaTests {
    private static final Instant START = Instant.parse("2026-11-24T00:00:00Z");
    private OperationalMetrics fresh() { return new OperationalMetrics(Clock.fixed(START, ZoneOffset.UTC)); }
    private void answer(OperationalMetrics metrics, String method, String path, int status) throws Exception {
        var response = new MockHttpServletResponse();
        new RequestMetricsFilter(metrics).doFilter(new MockHttpServletRequest(method, path), response,
                (request, output) -> response.setStatus(status));
    }
    @Test void emptyCountersUseNullRatesAndDiscloseRestart() {
        var value = fresh().snapshot();
        assertEquals(START, value.since()); assertTrue(value.resetsOnRestart());
        assertEquals(0L, value.requests().total()); assertNull(value.requests().errorRate());
        assertNull(value.requests().p95Millis()); assertEquals(0, value.requests().latencySample());
        assertNull(value.notifications().successRate());
    }
    @Test void finishedResponsesClassifyServerErrorsAnd429Separately() throws Exception {
        var metrics = fresh();
        for (int status : new int[]{200, 400, 429, 500, 503}) answer(metrics, "GET", "/api/independent-probe", status);
        var value = metrics.snapshot();
        assertEquals(5L, value.requests().total()); assertEquals(2L, value.requests().serverErrors());
        assertEquals(1L, value.requests().tooManyRequests()); assertEquals(0.4, value.requests().errorRate(), 1e-12);
        assertEquals(5, value.requests().latencySample()); assertNotNull(value.requests().p95Millis());
    }
    @Test void failedSignInsAreOnlyTheDocumentedPostResponses() throws Exception {
        var metrics = fresh();
        answer(metrics, "POST", "/api/auth/login", 401);
        answer(metrics, "POST", "/api/auth/2fa/verify", 400);
        answer(metrics, "POST", "/api/auth/login", 429);
        answer(metrics, "GET", "/api/auth/login", 401);
        answer(metrics, "POST", "/api/auth/2fa/verify", 401);
        assertEquals(2L, metrics.snapshot().signIns().failed());
        assertEquals(1L, metrics.snapshot().requests().tooManyRequests());
    }
    @Test void genuineActuatorPathsAndMetricsReadsAreExcluded() throws Exception {
        var metrics = fresh();
        answer(metrics, "GET", "/actuator/health", 200);
        answer(metrics, "GET", "/actuator/env", 401);
        answer(metrics, "GET", "/api/admin/metrics", 200);
        assertEquals(0L, metrics.snapshot().requests().total());
    }
    @Test void aLookalikePrefixIsNotAnActuatorEndpointAndMustBeCounted() throws Exception {
        var metrics = fresh();
        answer(metrics, "GET", "/actuator-not-an-endpoint", 404);
        // The contract excludes /actuator/*, not ordinary paths which merely share a prefix.
        assertEquals(1L, metrics.snapshot().requests().total());
    }
    @Test void nearestRankIsInMillisecondsAndUsesOnlyTheLatestTwoThousand() {
        var metrics = fresh();
        for (int millis = 1; millis <= 100; millis++) metrics.request(200, millis * 1_000_000L);
        assertEquals(95L, metrics.snapshot().requests().p95Millis());
        for (int i = 0; i < 2100; i++) metrics.request(200, 1_000_000L);
        assertEquals(2200L, metrics.snapshot().requests().total());
        assertEquals(2000, metrics.snapshot().requests().latencySample());
        assertEquals(1L, metrics.snapshot().requests().p95Millis());
    }
    @Test void aNewInstanceResetsAllCountersRatherThanClaimingLifetimeTotals() {
        var old = fresh(); old.request(500, 1_000_000L); old.accountLocked(); old.notificationSent(); old.notificationsFailed(2);
        var reset = new OperationalMetrics(Clock.fixed(START.plusSeconds(60), ZoneOffset.UTC)).snapshot();
        assertEquals(START.plusSeconds(60), reset.since()); assertEquals(0L, reset.requests().total());
        assertEquals(0L, reset.signIns().lockouts()); assertEquals(0L, reset.notifications().sent());
        assertEquals(0L, reset.notifications().failed()); assertNull(reset.requests().p95Millis());
    }
    @Test void notificationOutcomeArithmeticUsesFinalFailuresAndFractionUnits() {
        var metrics = fresh(); metrics.notificationSent(); metrics.notificationSent(); metrics.notificationsFailed(3);
        var value = metrics.snapshot().notifications();
        assertEquals(2L, value.sent()); assertEquals(3L, value.failed()); assertEquals(0.4, value.successRate(), 1e-12);
    }
}
