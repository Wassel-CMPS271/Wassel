package independent.scrum295;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.WasselBackendApplication;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real application, PostgreSQL/Flyway, security chain and metrics endpoint; role principals are test fixtures. */
@SpringBootTest(classes = WasselBackendApplication.class, properties = "wassel.auth.lockout.max-failures=5")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@ActiveProfiles("test")
@Import(IndependentAdminMetricsCriteriaTests.Probes.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class IndependentAdminMetricsCriteriaTests {
    private static final String METRICS = "/api/admin/metrics";
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    private RequestPostProcessor as(Role role) {
        var user = User.builder().id(UUID.randomUUID()).email("fixture@independent.invalid").passwordHash("unused")
                .role(role).schoolId(UUID.randomUUID()).build();
        return authentication(new UsernamePasswordAuthenticationToken(user, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))));
    }
    private String read() throws Exception {
        return mvc.perform(get(METRICS).with(as(Role.ADMIN))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }
    private long n(String json, String path) { return ((Number) JsonPath.read(json, path)).longValue(); }
    @Test void everyOtherRoleAndSignedOutCallerIsRefusedWithoutMetricData() throws Exception {
        read();
        for (var role : List.of(Role.HEAD_OF_TRANSPORT, Role.DRIVER, Role.PARENT)) {
            var body = mvc.perform(get(METRICS).with(as(role))).andExpect(status().isForbidden()).andReturn().getResponse().getContentAsString();
            assertFalse(body.contains("serverErrors"));
        }
        var body = mvc.perform(get(METRICS)).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        assertFalse(body.contains("serverErrors"));
    }
    @Test void responseIsAggregateOnlyAndHealthIsTheOnlyPublicActuatorPath() throws Exception {
        String json = read(); Map<String,Object> body = JsonPath.read(json, "$");
        assertEquals(Set.of("since", "resetsOnRestart", "requests", "signIns", "notifications"), body.keySet());
        assertNotNull(Instant.parse((String) body.get("since"))); assertEquals(true, body.get("resetsOnRestart"));
        for (String path : List.of("$.requests.total", "$.requests.serverErrors", "$.requests.tooManyRequests", "$.requests.latencySample", "$.signIns.failed", "$.signIns.lockouts", "$.notifications.sent", "$.notifications.failed")) assertTrue(n(json,path) >= 0);
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist()).andExpect(jsonPath("$.details").doesNotExist());
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/env").with(as(Role.ADMIN))).andExpect(status().isNotFound());
        assertEquals(n(json,"$.requests.total"), n(read(),"$.requests.total"));
    }
    @Test void scriptedHttpStatusesAndFailedLoginsProduceExactCounterDeltas() throws Exception {
        String before = read();
        mvc.perform(get("/api/admin/scrum295-probe/500").with(as(Role.ADMIN))).andExpect(status().isInternalServerError());
        mvc.perform(get("/api/admin/scrum295-probe/429").with(as(Role.ADMIN))).andExpect(status().isTooManyRequests());
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        for (int i=0;i<2;i++) mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"nobody@independent.invalid\",\"password\":\"Wrong-Pass-123\"}"))
                .andExpect(status().isUnauthorized());
        String after = read();
        assertEquals(5L,n(after,"$.requests.total")-n(before,"$.requests.total"));
        assertEquals(1L,n(after,"$.requests.serverErrors")-n(before,"$.requests.serverErrors"));
        assertEquals(1L,n(after,"$.requests.tooManyRequests")-n(before,"$.requests.tooManyRequests"));
        assertEquals(2L,n(after,"$.signIns.failed")-n(before,"$.signIns.failed"));
        assertEquals((String) JsonPath.read(before,"$.since"),(String) JsonPath.read(after,"$.since"));
        assertNotNull((Object) JsonPath.read(after,"$.requests.p95Millis"));
    }
    @Test void anActualAccountLockIsCountedOnceAndLaterRefusalsAreOnlyFailedSignIns() throws Exception {
        String email = UUID.randomUUID()+"@independent.invalid";
        users.save(User.builder().email(email).passwordHash(passwords.encode("Correct-Pass-123"))
                .role(Role.PARENT).schoolId(UUID.randomUUID()).enabled(true).build());
        String before = read();
        for (int i=0;i<6;i++) mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\""+email+"\",\"password\":\"Wrong-Pass-123\"}"))
                .andExpect(status().isUnauthorized());
        String after = read();
        assertEquals(1L,n(after,"$.signIns.lockouts")-n(before,"$.signIns.lockouts"));
        assertEquals(6L,n(after,"$.signIns.failed")-n(before,"$.signIns.failed"));
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class Probes { @Bean ProbeController independentProbeController() { return new ProbeController(); } }
    // Test-only response sources, outside the application's component-scan package.
    @RestController
    static class ProbeController {
        @GetMapping("/api/admin/scrum295-probe/{code}")
        ResponseEntity<Void> answer(@PathVariable int code) { return ResponseEntity.status(code).build(); }
    }
}
