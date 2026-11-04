package com.wassel.backend.e2e;

import com.wassel.backend.WasselBackendApplication;
import com.wassel.backend.users.repository.UserRepository;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import java.sql.DriverManager;

/** Test-classpath launcher: production AdminSeeder/DemoDataSeeder and real auth. */
public class AuthE2eApplication {
    public static void main(String[] args) throws Exception {
        String url = System.getenv("DB_URL");
        if (!"true".equals(System.getenv("WASSEL_E2E")) || url == null
                || !url.matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/wassel_e2e")) {
            throw new IllegalStateException("Auth E2E requires an isolated loopback wassel_e2e PostgreSQL database");
        }
        // Before Spring/Flyway can write: the entire public schema must be empty.
        // A test-like database name alone is insufficient evidence of isolation.
        try (var connection = DriverManager.getConnection(url, System.getenv("DB_USERNAME"), System.getenv("DB_PASSWORD"));
             var statement = connection.createStatement();
             var tables = statement.executeQuery("select count(*) from information_schema.tables where table_schema = 'public'")) {
            tables.next();
            if (tables.getLong(1) != 0) throw new IllegalStateException("Auth E2E refuses a nonempty database before migrations");
        }
        new SpringApplication(WasselBackendApplication.class, Checks.class).run(args);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Checks {
        @Bean
        @Order(Ordered.HIGHEST_PRECEDENCE)
        ApplicationRunner refuseExistingAccounts(UserRepository users) {
            return args -> {
                if (users.count() != 0) throw new IllegalStateException("Auth E2E refuses an existing account database");
            };
        }

        @Bean
        ApplicationListener<ApplicationReadyEvent> seeded(UserRepository users) {
            return event -> {
                for (String email : new String[] {"admin@auth-e2e.invalid", "auth+head@auth-e2e.invalid",
                        "auth+driver-karim@auth-e2e.invalid", "auth+parent@auth-e2e.invalid"}) {
                    if (users.findByEmailIgnoreCase(email).isEmpty()) {
                        throw new IllegalStateException("Production demo/admin seed did not create the required account");
                    }
                }
                org.slf4j.LoggerFactory.getLogger(AuthE2eApplication.class).info("E2E_SEED_READY");
            };
        }
    }
}
