package com.wassel.backend.e2e;

import com.wassel.backend.WasselBackendApplication;
import com.wassel.backend.drivers.entity.Driver;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.schools.entity.SchoolSettings;
import com.wassel.backend.schools.repository.SchoolSettingsRepository;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import com.wassel.backend.vehicles.entity.Vehicle;
import com.wassel.backend.vehicles.repository.VehicleRepository;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

/** Test-classpath-only launcher: real server/security/services, isolated fixture database. */
public class RoutingE2eApplication {
    public static void main(String[] args) {
        if (!"true".equals(System.getenv("WASSEL_E2E"))) {
            throw new IllegalStateException("E2E launcher requires WASSEL_E2E=true");
        }
        String url = System.getenv("DB_URL");
        if (url == null || !(url.equals("jdbc:h2:mem:wassel_e2e;MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
                || url.matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/wassel_e2e"))) {
            throw new IllegalStateException("E2E launcher only accepts its in-memory DB or loopback wassel_e2e PostgreSQL");
        }
        new SpringApplication(WasselBackendApplication.class, Seed.class).run(args);
    }

    @Profile("e2e")
    @TestConfiguration(proxyBeanMethods = false)
    static class Seed {
        @Bean
        ApplicationRunner routingE2eSeed(UserRepository users, VehicleRepository vehicles,
                DriverRepository drivers, StudentRepository students, SchoolSettingsRepository settings,
                PasswordEncoder encoder) {
            return args -> {
                if (users.count() != 0 || vehicles.count() != 0 || students.count() != 0) {
                    throw new IllegalStateException("E2E requires an empty disposable database; refusing to change existing data");
                }
                String password = System.getenv("WASSEL_E2E_PASSWORD");
                if (password == null || password.length() < 16) throw new IllegalStateException("Missing generated E2E password");
                UUID school = UUID.randomUUID();
                users.saveAndFlush(User.builder().email("routing-head@e2e.invalid").passwordHash(encoder.encode(password))
                        .role(Role.HEAD_OF_TRANSPORT).schoolId(school).build());
                settings.saveAndFlush(SchoolSettings.builder().schoolId(school).arrivalTime(LocalTime.of(8, 0)).build());
                Vehicle vehicle = vehicles.saveAndFlush(Vehicle.builder().schoolId(school).plateNumber("E2E 230")
                        .capacity(14).active(true).build());
                drivers.saveAndFlush(Driver.builder().schoolId(school).firstName("E2E").lastName("Driver")
                        .phone("+961 70 230 001").email("routing-driver@e2e.invalid").status(DriverStatus.ACTIVE)
                        .invitedAt(Instant.now()).assignedVehicleId(vehicle.getId()).build());
                // Far, near, middle: manual A-B-C takes 13 min; A-C-B takes 9 min.
                String[] latitudes = {"33.866", "33.886", "33.876"};
                String[] names = {"Alpha", "Bravo", "Charlie"};
                for (int i = 0; i < names.length; i++) {
                    students.saveAndFlush(Student.builder().schoolId(school).firstName(names[i]).lastName("E2E")
                            .grade("5").guardianName("E2E Guardian").guardianPhone("+961 3 230 001")
                            .status(StudentStatus.ACTIVE).address("E2E pickup " + names[i])
                            .latitude(new BigDecimal(latitudes[i])).longitude(new BigDecimal("35.484"))
                            .manualPin(true).build());
                }
                // Readiness marker, intentionally contains no credentials or codes.
                org.slf4j.LoggerFactory.getLogger(RoutingE2eApplication.class).info("E2E_SEED_READY");
            };
        }
    }
}
