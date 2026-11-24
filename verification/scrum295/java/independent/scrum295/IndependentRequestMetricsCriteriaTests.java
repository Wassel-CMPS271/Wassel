package independent.scrum295;

import com.wassel.backend.monitoring.config.RequestMetricsFilter;
import com.wassel.backend.monitoring.service.OperationalMetrics;
import org.junit.jupiter.api.Test;
import com.wassel.backend.WasselBackendApplication;
import com.wassel.backend.auth.entity.LoginCode;
import com.wassel.backend.auth.repository.LoginCodeRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import static org.junit.jupiter.api.Assertions.*;

/** Independent SCRUM-295 assertions from admin-metrics.md, not the author's tests. */
@SpringBootTest(classes = WasselBackendApplication.class)
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class IndependentRequestMetricsCriteriaTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired LoginCodeRepository codes;
    @Autowired PasswordEncoder passwords;
    @Autowired OperationalMetrics appMetrics;
    private String hash(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }
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
        // Merged contract distinguishes actual wrong codes from a merely malformed 400 response.
        // Keep the original expected two failures and one 429; exercise the real service/security path.
        String email = UUID.randomUUID()+"@independent.invalid";
        String password = "Correct-Test-Pass-123";
        var user = users.save(User.builder().email(email).passwordHash(passwords.encode(password))
                .role(Role.PARENT).schoolId(UUID.randomUUID()).enabled(true).build());
        String token = UUID.randomUUID().toString();
        codes.save(LoginCode.builder().userId(user.getId()).pendingHash(hash(token)).codeHash(hash("123456"))
                .sentAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300)).build());
        Cookie pending = new Cookie("wassel_2fa",token);
        long failedBefore = appMetrics.snapshot().signIns().failed();
        long limitedBefore = appMetrics.snapshot().requests().tooManyRequests();
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"nobody@independent.invalid\",\"password\":\"Wrong-Test-Pass-123\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/2fa/verify").cookie(pending).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"654321\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/2fa/verify").cookie(pending).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"12\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\""+email+"\",\"password\":\""+password+"\"}"))
                .andExpect(status().isTooManyRequests());
        mvc.perform(get("/api/auth/login")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/2fa/verify").contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"654321\"}")).andExpect(status().isUnauthorized());
        assertEquals(2L, appMetrics.snapshot().signIns().failed()-failedBefore);
        assertEquals(1L, appMetrics.snapshot().requests().tooManyRequests()-limitedBefore);
        for (int attempt=2;attempt<=5;attempt++) {
            mvc.perform(post("/api/auth/2fa/verify").cookie(pending).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"code\":\"654321\"}"))
                    .andExpect(attempt==5?status().isUnauthorized():status().isBadRequest());
        }
        assertEquals(6L, appMetrics.snapshot().signIns().failed()-failedBefore,
                "wrong password plus all five wrong codes, including the fifth 401");
        mvc.perform(post("/api/auth/2fa/verify").cookie(pending).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"123456\"}")).andExpect(status().isUnauthorized());
        assertEquals(6L, appMetrics.snapshot().signIns().failed()-failedBefore,
                "an already-ended pending login is not a new wrong code");
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
