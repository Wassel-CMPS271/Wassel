package com.wassel.backend.e2e;

import com.wassel.backend.common.config.ClockConfig;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/** Explicit test source only: ticking Monday school time; auth/JWT still use real time. */
@TestConfiguration(proxyBeanMethods = false)
public class WeekdayE2eClock {
    @Bean
    @Primary
    Clock weekdayClock() {
        String url = System.getenv("DB_URL");
        if (!"true".equals(System.getenv("WASSEL_E2E")) || url == null
                || !url.matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/wassel_e2e")) {
            throw new IllegalStateException("Weekday E2E clock requires the isolated loopback test database");
        }
        Clock real = Clock.system(ClockConfig.SCHOOL_ZONE);
        return Clock.offset(real, Duration.between(real.instant(), Instant.parse("2026-11-02T08:00:00Z")));
    }
}
