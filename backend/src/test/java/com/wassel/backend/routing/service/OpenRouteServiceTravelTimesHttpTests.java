package com.wassel.backend.routing.service;

import com.sun.net.httpserver.HttpServer;
import com.wassel.backend.routing.config.OpenRouteServiceProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Runs {@link OpenRouteServiceTravelTimes} against a real HTTP server on localhost that stands in for
 * OpenRouteService, so what goes over the wire and how failures are handled are the real client's.
 * The stand-in works out each answer from the coordinates it is sent, not from their position, so a
 * client that sent or read the points in the wrong order gets the wrong numbers. See {@link #seconds}.
 */
class OpenRouteServiceTravelTimesHttpTests {

	private static final String KEY = "test-key-123";

	private static final Pattern LOCATION = Pattern.compile("\\[(-?[0-9.]+),(-?[0-9.]+)]");

	private final StraightLineTravelTimes straightLine = new StraightLineTravelTimes();

	private final MutableClock clock = new MutableClock();

	private HttpServer server;

	private ExecutorService serverThreads;

	private final List<String> bodies = new CopyOnWriteArrayList<>();

	private final List<String> authorizations = new CopyOnWriteArrayList<>();

	private final List<String> queries = new CopyOnWriteArrayList<>();

	private final AtomicInteger requests = new AtomicInteger();

	private volatile int status = 200;

	/** Sent instead of the generated matrix when set. */
	private volatile String fixedBody;

	private volatile long delayMillis;

	/** Cells the stand-in leaves null, as "row,column" in the order the points were sent. */
	private volatile List<String> nullCells = List.of();

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/v2/matrix/driving-car", exchange -> {
			requests.incrementAndGet();
			String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
			bodies.add(body);
			authorizations.add(String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
			queries.add(String.valueOf(exchange.getRequestURI().getRawQuery()));
			if (delayMillis > 0) {
				try {
					Thread.sleep(delayMillis);
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
			}
			String reply = status != 200 ? "{\"error\":\"no\"}" : fixedBody != null ? fixedBody : durationsFor(locations(body));
			byte[] bytes = reply.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(status, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		// The default executor is single-threaded, so a request left sleeping would block the next one.
		serverThreads = Executors.newCachedThreadPool();
		server.setExecutor(serverThreads);
		server.start();
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
		serverThreads.shutdownNow();
	}

	/** The {@code [lon, lat]} pairs of a request body, in the order sent. */
	private static List<double[]> locations(String body) {
		List<double[]> found = new ArrayList<>();
		Matcher m = LOCATION.matcher(body);
		while (m.find()) {
			found.add(new double[] { Double.parseDouble(m.group(1)), Double.parseDouble(m.group(2)) });
		}
		return found;
	}

	/**
	 * Seconds from one {@code [lon, lat]} to another: 60 per hundredth of a degree of latitude, plus one,
	 * plus 60 going north. So the minutes, rounded up, are the steps + 1 (+1 going north), and the two
	 * directions differ.
	 */
	private static long seconds(double[] from, double[] to) {
		long steps = Math.round(Math.abs(from[1] - to[1]) * 100);
		return steps * 60 + 1 + (from[1] < to[1] ? 60 : 0);
	}

	private String durationsFor(List<double[]> sent) {
		StringBuilder rows = new StringBuilder();
		for (int i = 0; i < sent.size(); i++) {
			rows.append(i == 0 ? "[" : ",[");
			for (int j = 0; j < sent.size(); j++) {
				String cell = i == j ? "0"
						: nullCells.contains(i + "," + j) ? "null" : String.valueOf(seconds(sent.get(i), sent.get(j)));
				rows.append(j == 0 ? "" : ",").append(cell);
			}
			rows.append("]");
		}
		return "{\"durations\":[" + rows + "]}";
	}

	private OpenRouteServiceTravelTimes client(String baseUrl, String key, Duration timeout) {
		return new OpenRouteServiceTravelTimes(RestClient.builder(),
				new OpenRouteServiceProperties(baseUrl, key, timeout), straightLine, clock);
	}

	private OpenRouteServiceTravelTimes client(String key, Duration timeout) {
		return client("http://127.0.0.1:" + server.getAddress().getPort(), key, timeout);
	}

	private OpenRouteServiceTravelTimes client() {
		return client(KEY, Duration.ofSeconds(5));
	}

	/** {@code n} points a hundredth of a degree of latitude apart, southernmost first. */
	private static List<Coordinate> points(int n) {
		List<Coordinate> points = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			points.add(new Coordinate(33.80 + i * 0.01, 35.50));
		}
		return points;
	}

	/** 59 points that share nothing with {@code disjointSet(other)}. */
	private static List<Coordinate> disjointSet(int k) {
		List<Coordinate> points = new ArrayList<>();
		for (int i = 0; i < OpenRouteServiceTravelTimes.MAX_POINTS; i++) {
			points.add(new Coordinate(10 + k + i * 0.01, 35.50));
		}
		return points;
	}

	private static boolean sameMetre(Coordinate a, Coordinate b) {
		return Math.round(a.latitude() * 1e5) == Math.round(b.latitude() * 1e5)
				&& Math.round(a.longitude() * 1e5) == Math.round(b.longitude() * 1e5);
	}

	private static Duration roadMinutes(Coordinate from, Coordinate to) {
		if (sameMetre(from, to)) {
			return Duration.ZERO;
		}
		double[] a = { from.longitude(), from.latitude() };
		double[] b = { to.longitude(), to.latitude() };
		return Duration.ofMinutes((long) Math.ceil(seconds(a, b) / 60.0));
	}

	/** Every cell is what the stand-in says for those two coordinates, wherever they sit in the input. */
	private static void assertRoadTimes(List<Coordinate> points, Duration[][] matrix) {
		assertEquals(points.size(), matrix.length);
		for (int i = 0; i < points.size(); i++) {
			assertEquals(points.size(), matrix[i].length);
			for (int j = 0; j < points.size(); j++) {
				assertEquals(roadMinutes(points.get(i), points.get(j)), matrix[i][j], i + "->" + j);
			}
		}
	}

	private void assertStraightLine(List<Coordinate> points, Duration[][] actual) {
		assertTrue(Arrays.deepEquals(straightLine.matrix(points), actual), "expected straight-line estimates");
	}

	@Test
	void sendsLongitudeFirstRoundedToAMetreWithTheKeyInTheHeader() {
		client().matrix(List.of(new Coordinate(33.8959951, 35.484), new Coordinate(33.8938, 35.5018)));

		assertEquals(1, requests.get());
		assertTrue(bodies.get(0).contains("[35.484,33.896]"), bodies.get(0));
		assertTrue(bodies.get(0).contains("[35.5018,33.8938]"), bodies.get(0));
		assertTrue(bodies.get(0).contains("\"metrics\":[\"duration\"]"), bodies.get(0));
		assertEquals(KEY, authorizations.get(0));
		assertEquals("null", queries.get(0), "the key must never be in the URL");
	}

	@Test
	void everyCellIsTheAnswerForItsOwnPairOfPointsInAnyInputOrder() {
		Coordinate south = new Coordinate(33.80, 35.50);
		Coordinate far = new Coordinate(33.95, 35.50);
		Coordinate near = new Coordinate(33.81, 35.50);
		List<Coordinate> shuffled = List.of(far, south, near);

		Duration[][] matrix = client().matrix(shuffled);

		assertRoadTimes(shuffled, matrix);
		assertFalse(matrix[0][1].equals(matrix[1][0]), "the matrix is not assumed symmetric");
		assertEquals(Duration.ofMinutes(17), matrix[1][0], "15 steps north, plus the northward minute, plus one");
	}

	@Test
	void knownPairsAreNotRequestedAgainAndANewPointCostsOneRequest() {
		OpenRouteServiceTravelTimes client = client();
		List<Coordinate> route = points(3);

		Duration[][] first = client.matrix(route);
		assertRoadTimes(route, first);
		assertTrue(Arrays.deepEquals(first, client.matrix(route)));
		assertEquals(1, requests.get());

		List<Coordinate> reordered = List.of(route.get(2), route.get(0), route.get(1));
		assertRoadTimes(reordered, client.matrix(reordered));
		assertEquals(1, requests.get(), "the same pairs in another order are all cached");

		List<Coordinate> withNewStop = new ArrayList<>(route);
		withNewStop.add(new Coordinate(33.95, 35.60));
		assertRoadTimes(withNewStop, client.matrix(withNewStop));
		assertEquals(2, requests.get(), "one new stop is one more request, for the whole set");
		client.matrix(withNewStop);
		assertEquals(2, requests.get());
	}

	@Test
	void aSubsetOfKnownPointsIsServedFromTheCache() {
		OpenRouteServiceTravelTimes client = client();
		List<Coordinate> route = points(4);

		client.matrix(route);
		assertRoadTimes(route.subList(0, 2), client.matrix(route.subList(0, 2)));

		assertEquals(1, requests.get());
	}

	@Test
	void pointsWithinAMetreShareOneCacheEntryAndAreZeroApart() {
		Coordinate a = new Coordinate(33.80, 35.50);
		Coordinate sibling = new Coordinate(33.800000001, 35.50);
		Coordinate b = new Coordinate(33.81, 35.50);
		OpenRouteServiceTravelTimes client = client();

		Duration[][] matrix = client.matrix(List.of(a, sibling, b));

		assertEquals(2, locations(bodies.get(0)).size(), "the sibling must not be sent twice");
		assertRoadTimes(List.of(a, sibling, b), matrix);
		assertEquals(Duration.ZERO, matrix[0][1]);
		assertEquals(Duration.ZERO, matrix[1][0]);

		client.matrix(List.of(sibling, b));
		client.matrix(List.of(new Coordinate(33.8000001, 35.5000001), b));
		assertEquals(1, requests.get(), "coordinates a hundred-millionth of a degree apart are the same key");
	}

	@Test
	void aPairWithNoRouteGetsTheStraightLineValueAndIsNotRequestedAgain() {
		nullCells = List.of("0,1");
		OpenRouteServiceTravelTimes client = client();
		List<Coordinate> route = points(3);

		Duration[][] matrix = client.matrix(route);
		client.matrix(route);

		assertEquals(straightLine.matrix(route)[0][1], matrix[0][1]);
		assertEquals(roadMinutes(route.get(1), route.get(0)), matrix[1][0], "its reverse is a real answer");
		assertEquals(roadMinutes(route.get(0), route.get(2)), matrix[0][2]);
		assertEquals(1, requests.get());
	}

	@Test
	void aZeroSecondPairBetweenDifferentPointsIsAllowed() {
		fixedBody = "{\"durations\":[[0,0],[0,0]]}";

		Duration[][] matrix = client().matrix(points(2));

		assertEquals(Duration.ZERO, matrix[0][1]);
		assertEquals(1, requests.get());
	}

	@Test
	void aSingleOrEmptyPointNeverCallsTheProvider() {
		OpenRouteServiceTravelTimes client = client();
		Coordinate here = points(1).get(0);

		assertEquals(0, client.matrix(List.of()).length);
		assertEquals(Duration.ZERO, client.matrix(List.of(here))[0][0]);
		assertEquals(Duration.ZERO, client.matrix(List.of(here, here))[0][1]);
		assertEquals(0, requests.get());
	}

	@Test
	void withoutAKeyNothingIsRequestedAndTimesAreStraightLine() {
		for (String blank : new String[] { "", "  ", null }) {
			OpenRouteServiceTravelTimes client = client(blank, Duration.ofSeconds(5));
			assertStraightLine(points(3), client.matrix(points(3)));
		}
		assertEquals(0, requests.get());
	}

	@Test
	void theKeyIsTrimmedAndAMissingTimeoutStillWorks() {
		client("  " + KEY + " \n", null).matrix(points(2));

		assertEquals(KEY, authorizations.get(0));
	}

	@Test
	void tooManyDistinctPointsForOneRequestAreStraightLineAndNotRequested() {
		List<Coordinate> many = points(OpenRouteServiceTravelTimes.MAX_POINTS + 1);
		OpenRouteServiceTravelTimes client = client();

		assertStraightLine(many, client.matrix(many));
		assertStraightLine(many, client.matrix(many));

		assertEquals(0, requests.get());
	}

	@Test
	void theLimitCountsDistinctPointsNotInputLength() {
		List<Coordinate> largest = points(OpenRouteServiceTravelTimes.MAX_POINTS);
		List<Coordinate> withRepeats = new ArrayList<>(largest);
		withRepeats.addAll(largest.subList(0, 11));

		assertRoadTimes(withRepeats, client().matrix(withRepeats));

		assertEquals(1, requests.get());
		assertEquals(OpenRouteServiceTravelTimes.MAX_POINTS, locations(bodies.get(0)).size());
	}

	@Test
	void tooManyRequestsFallsBackAndLeavesTheProviderAloneForAMinute() {
		status = 429;
		OpenRouteServiceTravelTimes client = client();
		List<Coordinate> route = points(3);

		assertStraightLine(route, client.matrix(route));
		List<Coordinate> other = List.of(route.get(0), route.get(2));
		assertStraightLine(other, client.matrix(other));
		assertEquals(1, requests.get(), "no second call inside the pause, even for another set");

		clock.advance(OpenRouteServiceTravelTimes.SHORT_PAUSE.minusSeconds(1));
		client.matrix(route);
		assertEquals(1, requests.get(), "still paused one second before the minute is up");

		clock.advance(Duration.ofSeconds(2));
		status = 200;
		assertRoadTimes(route, client.matrix(route));
		assertEquals(2, requests.get());
	}

	@Test
	void aRefusedKeyOrQuotaLeavesTheProviderAloneForAnHour() {
		for (int refused : new int[] { 401, 403 }) {
			requests.set(0);
			status = refused;
			OpenRouteServiceTravelTimes client = client();
			List<Coordinate> route = points(3);

			assertStraightLine(route, client.matrix(route));
			clock.advance(Duration.ofMinutes(59));
			assertStraightLine(route, client.matrix(route));
			assertEquals(1, requests.get(), "status " + refused);

			clock.advance(Duration.ofMinutes(2));
			status = 200;
			assertRoadTimes(route, client.matrix(route));
			assertEquals(2, requests.get(), "status " + refused);
		}
	}

	@Test
	void aServerErrorFallsBackAndPausesForAMinute() {
		status = 503;
		OpenRouteServiceTravelTimes client = client();
		List<Coordinate> route = points(3);

		assertStraightLine(route, client.matrix(route));
		assertStraightLine(route, client.matrix(route));
		assertEquals(1, requests.get());

		clock.advance(OpenRouteServiceTravelTimes.SHORT_PAUSE.plusSeconds(1));
		status = 200;
		client.matrix(route);
		assertEquals(2, requests.get());
	}

	@Test
	void aSlowProviderTimesOutFallsBackAndIsNotAskedAgain() {
		delayMillis = 1_500;
		OpenRouteServiceTravelTimes client = client(KEY, Duration.ofMillis(200));
		List<Coordinate> route = points(3);

		assertStraightLine(route, client.matrix(route));
		assertStraightLine(route, client.matrix(route));

		assertEquals(1, requests.get());
	}

	@Test
	void aProviderThatIsNotThereFallsBack() throws IOException {
		int closedPort;
		try (ServerSocket socket = new ServerSocket(0)) {
			closedPort = socket.getLocalPort();
		}
		OpenRouteServiceTravelTimes client = client("http://127.0.0.1:" + closedPort, KEY, Duration.ofSeconds(2));

		assertStraightLine(points(3), client.matrix(points(3)));
		assertStraightLine(points(3), client.matrix(points(3)));
	}

	@Test
	void aRejectedPointSetIsNotAskedAgainForAnHourButAnotherSetIs() {
		status = 400;
		OpenRouteServiceTravelTimes client = client();
		List<Coordinate> route = points(3);

		assertStraightLine(route, client.matrix(route));
		List<Coordinate> shuffled = List.of(route.get(2), route.get(0), route.get(1));
		assertStraightLine(shuffled, client.matrix(shuffled));
		assertEquals(1, requests.get(), "the same set in another order is still the rejected set");

		status = 200;
		client.matrix(List.of(new Coordinate(34.0, 35.6), new Coordinate(34.01, 35.6), new Coordinate(34.02, 35.6)));
		assertEquals(2, requests.get(), "a 400 about one set must not stop the others");

		clock.advance(Duration.ofMinutes(59));
		client.matrix(route);
		assertEquals(2, requests.get(), "still rejected 59 minutes later");

		clock.advance(Duration.ofMinutes(2));
		assertRoadTimes(route, client.matrix(route));
		assertEquals(3, requests.get());
	}

	@Test
	void anAnswerThatDoesNotFitFallsBackPausesAndCachesNothing() {
		OpenRouteServiceTravelTimes client = client();
		List<Coordinate> route = points(3);
		String[] unusable = { "", "{}", "{\"durations\":null}", "{\"durations\":[[0,1],[1,0]]}",
				"{\"durations\":[[0,1,2],[1,0],[1,2,0]]}", "{\"durations\":[null,[1,0,1],[1,1,0]]}",
				"{\"durations\":[[0,-5,1],[1,0,1],[1,1,0]]}", "not json" };

		int expected = 0;
		for (String bad : unusable) {
			fixedBody = bad;
			clock.advance(OpenRouteServiceTravelTimes.SHORT_PAUSE.plusSeconds(1));
			assertStraightLine(route, client.matrix(route));
			assertEquals(++expected, requests.get(), "body: " + bad);
			assertStraightLine(route, client.matrix(route));
			assertEquals(expected, requests.get(), "a bad answer must pause the provider, body: " + bad);
		}

		fixedBody = null;
		clock.advance(OpenRouteServiceTravelTimes.SHORT_PAUSE.plusSeconds(1));
		assertRoadTimes(route, client.matrix(route));
	}

	@Test
	void aFailedFetchGivesAllStraightLineNeverAMixWithCachedRoadTimes() {
		OpenRouteServiceTravelTimes client = client();
		List<Coordinate> route = points(3);
		assertRoadTimes(route, client.matrix(route));

		status = 503;
		List<Coordinate> withNewStop = new ArrayList<>(route);
		withNewStop.add(new Coordinate(33.95, 35.60));
		assertStraightLine(withNewStop, client.matrix(withNewStop));

		assertRoadTimes(route, client.matrix(route));
		assertEquals(2, requests.get());
	}

	@Test
	void parallelMissesForTheSamePointsMakeOneRequest() throws Exception {
		delayMillis = 300;
		List<Coordinate> route = points(3);

		for (int answer : new int[] { 200, 429 }) {
			requests.set(0);
			status = answer;
			OpenRouteServiceTravelTimes client = client();
			ExecutorService pool = Executors.newFixedThreadPool(8);
			CountDownLatch go = new CountDownLatch(1);
			List<Future<Duration[][]>> results = new ArrayList<>();
			for (int i = 0; i < 8; i++) {
				results.add(pool.submit(() -> {
					go.await();
					return client.matrix(route);
				}));
			}
			go.countDown();
			for (Future<Duration[][]> result : results) {
				if (answer == 200) {
					assertRoadTimes(route, result.get(10, TimeUnit.SECONDS));
				} else {
					assertStraightLine(route, result.get(10, TimeUnit.SECONDS));
				}
			}
			pool.shutdownNow();
			assertEquals(1, requests.get(), "status " + answer);
		}
	}

	@Test
	void anInterruptedRequestFallsBackWithoutPausingTheProvider() {
		OpenRouteServiceTravelTimes client = client();
		List<Coordinate> route = points(3);

		Thread.currentThread().interrupt();
		try {
			assertStraightLine(route, client.matrix(route));
		} finally {
			Thread.interrupted();
		}

		assertRoadTimes(route, client.matrix(route));
		assertEquals(1, requests.get(), "being interrupted says nothing about the provider");
	}

	@Test
	void theCacheEmptiesWhenFullButKeepsWhatWasJustFetched() {
		OpenRouteServiceTravelTimes client = client();
		int sets = OpenRouteServiceTravelTimes.MAX_CACHED_PAIRS
				/ (OpenRouteServiceTravelTimes.MAX_POINTS * (OpenRouteServiceTravelTimes.MAX_POINTS - 1)) + 2;

		for (int k = 0; k < sets; k++) {
			client.matrix(disjointSet(k));
		}
		assertEquals(sets, requests.get());

		assertRoadTimes(disjointSet(sets - 1), client.matrix(disjointSet(sets - 1)));
		assertEquals(sets, requests.get(), "the set fetched last must survive the clear");

		client.matrix(disjointSet(0));
		assertEquals(sets + 1, requests.get(), "the first set went when the cache emptied");
	}

	@Test
	void theKeyIsNotInThePropertiesText() {
		String text = new OpenRouteServiceProperties("http://x", KEY, Duration.ofSeconds(3)).toString();

		assertFalse(text.contains(KEY), text);
	}

	/** A clock the test moves by hand, so pauses can be crossed without sleeping. */
	private static final class MutableClock extends Clock {

		private volatile Instant now = Instant.parse("2026-10-18T08:00:00Z");

		void advance(Duration by) {
			now = now.plus(by);
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}
	}
}
