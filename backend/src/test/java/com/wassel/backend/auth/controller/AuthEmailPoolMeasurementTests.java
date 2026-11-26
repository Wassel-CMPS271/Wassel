package com.wassel.backend.auth.controller;

import com.wassel.backend.inbox.service.RecordingMailer;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * SCRUM-289, acceptance criterion 1: do 100 sign-ins in one minute exhaust the pool of 10 connections when the mail
 * provider is slow? Off unless {@code -Dmeasure.SCRUM-289=true}, because it takes about five minutes:
 * {@code sh ./mvnw test -Dtest=AuthEmailPoolMeasurementTests -Dmeasure.SCRUM-289=true}. Real HTTP on a real port, real
 * PostgreSQL, Hikari at its default of 10 connections and 30 s wait, and a {@link RecordingMailer} that sleeps stands
 * in for the provider (Mohamad's k6 stand-in, SCRUM-293, can replace it). Prints one line per scenario and asserts only
 * that every sign-in succeeded and every probe read was served (what failed before the change): the numbers are the record,
 * in docs/testing/SCRUM-289/report.md. It is the measurement; {@code AuthEmailConnectionTests} is the regression guard.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(RecordingMailer.Config.class)
@EnabledIfSystemProperty(named = "measure.SCRUM-289", matches = "true")
class AuthEmailPoolMeasurementTests {

	private static final String PASSWORD = "correct-horse-battery";

	@LocalServerPort
	private int port;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@Autowired
	private DataSource dataSource;

	@Autowired
	private RecordingMailer mailer;

	private final HttpClient client = HttpClient.newBuilder().executor(Executors.newCachedThreadPool()).build();

	private record Timed(int status, long millis) {
	}

	@Test
	void measure() throws Exception {
		String session = signedInSession();
		System.out.println("SCRUM-289 pool measurement (pool of 10, wait 30 s)");
		for (long delayMs : new long[] { 800, 3000, 5000 }) {
			run("100 logins over 60 s, provider takes " + delayMs + " ms", delayMs, 60_000, session);
		}
		run("100 logins at once, provider takes 5000 ms", 5000, 0, session);
	}

	/** One parent with a live session, for the probe that stands in for everyone else. */
	private String signedInSession() throws Exception {
		User user = account();
		HttpResponse<String> login = post("/api/auth/login", "{\"email\":\"%s\",\"password\":\"%s\"}"
				.formatted(user.getEmail(), PASSWORD), null);
		String pending = cookie(login, "wassel_2fa");
		String code = mailer.sent().get(0).body().replaceAll("(?s).*?(\\d{6}).*", "$1");
		HttpResponse<String> verified = post("/api/auth/2fa/verify", "{\"code\":\"%s\"}".formatted(code),
				"wassel_2fa=" + pending);
		mailer.reset();
		return "wassel_token=" + cookie(verified, "wassel_token");
	}

	private void run(String title, long delayMs, long spreadMs, String session) throws Exception {
		List<User> users = new ArrayList<>();
		for (int i = 0; i < 100; i++) {
			users.add(account());
		}
		HikariDataSource pool = dataSource.unwrap(HikariDataSource.class);
		mailer.reset();
		mailer.whileSending(() -> sleep(delayMs));

		AtomicBoolean running = new AtomicBoolean(true);
		AtomicInteger maxActive = new AtomicInteger();
		AtomicInteger maxWaiting = new AtomicInteger();
		List<Timed> probes = new CopyOnWriteArrayList<>();
		Thread sampler = Thread.ofPlatform().start(() -> {
			while (running.get()) {
				maxActive.accumulateAndGet(pool.getHikariPoolMXBean().getActiveConnections(), Math::max);
				maxWaiting.accumulateAndGet(pool.getHikariPoolMXBean().getThreadsAwaitingConnection(), Math::max);
				sleep(50);
			}
		});
		Thread probe = Thread.ofPlatform().start(() -> {
			while (running.get()) {
				probes.add(timed(() -> get("/api/auth/me", session)));
				sleep(500);
			}
		});

		ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(100);
		List<CompletableFuture<Timed>> logins = new ArrayList<>();
		for (int i = 0; i < users.size(); i++) {
			User user = users.get(i);
			CompletableFuture<Timed> done = new CompletableFuture<>();
			scheduler.schedule(() -> done.complete(timed(() -> post("/api/auth/login",
					"{\"email\":\"%s\",\"password\":\"%s\"}".formatted(user.getEmail(), PASSWORD), null))),
					spreadMs * i / users.size(), TimeUnit.MILLISECONDS);
			logins.add(done);
		}
		List<Timed> results = new ArrayList<>();
		for (CompletableFuture<Timed> done : logins) {
			results.add(done.get(5, TimeUnit.MINUTES));
		}
		running.set(false);
		sampler.join();
		probe.join();
		scheduler.shutdownNow();

		Map<Integer, Long> statuses = new TreeMap<>();
		results.forEach(r -> statuses.merge(r.status(), 1L, Long::sum));
		System.out.printf("SCRUM-289 | %s | max active %d | max waiting %d | login statuses %s | login ms %s | probe ms %s "
				+ "(non-200: %d)%n", title, maxActive.get(), maxWaiting.get(), statuses, percentiles(results),
				percentiles(probes), probes.stream().filter(p -> p.status() != 200).count());
		assertEquals(100, results.size(), "every login got an answer");
		assertEquals(0, results.stream().filter(r -> r.status() != 204).count(),
				"every sign-in succeeded: " + statuses + " (before SCRUM-289 a crowd of 100 got 500s)");
		assertEquals(0, probes.stream().filter(p -> p.status() != 200).count(), "every probe read was served");
	}

	private User account() {
		return userRepository.save(User.builder().email(UUID.randomUUID() + "@wassel.test")
				.passwordHash(passwordEncoder.encode(PASSWORD)).role(Role.PARENT).schoolId(UUID.randomUUID()).build());
	}

	private Timed timed(Request request) {
		long start = System.nanoTime();
		int status;
		try {
			status = request.send().statusCode();
		}
		catch (Exception e) {
			status = -1;
		}
		return new Timed(status, (System.nanoTime() - start) / 1_000_000);
	}

	private interface Request {
		HttpResponse<String> send() throws Exception;
	}

	private HttpResponse<String> post(String path, String json, String cookie) throws Exception {
		HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
				.timeout(Duration.ofMinutes(3)).header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(json));
		if (cookie != null) {
			request.header("Cookie", cookie);
		}
		return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
	}

	private HttpResponse<String> get(String path, String cookie) throws Exception {
		return client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
				.timeout(Duration.ofMinutes(3)).header("Cookie", cookie).GET().build(),
				HttpResponse.BodyHandlers.ofString());
	}

	private static String cookie(HttpResponse<String> response, String name) {
		return response.headers().allValues("Set-Cookie").stream().filter(c -> c.startsWith(name + "="))
				.map(c -> c.substring(name.length() + 1, c.indexOf(';'))).findFirst().orElseThrow();
	}

	private static String percentiles(List<Timed> timings) {
		List<Long> sorted = new ArrayList<>(timings.stream().map(Timed::millis).toList());
		Collections.sort(sorted);
		return "p50 %d / p95 %d / max %d".formatted(sorted.get(sorted.size() / 2),
				sorted.get((int) Math.ceil(sorted.size() * 0.95) - 1), sorted.get(sorted.size() - 1));
	}

	private static void sleep(long millis) {
		try {
			Thread.sleep(millis);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}
}
