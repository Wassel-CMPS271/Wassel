package com.wassel.backend.routing.service;

import com.wassel.backend.routing.config.OpenRouteServiceProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Calls the real OpenRouteService once. Runs only when {@code ORS_API_KEY} is set, so CI skips it,
 * and spends one of the 500 daily requests. It is what shows the stand-in server in
 * {@link OpenRouteServiceTravelTimesHttpTests} still describes the real provider (longitude first,
 * seconds, one row per source).
 */
@EnabledIfEnvironmentVariable(named = "ORS_API_KEY", matches = ".+")
class OpenRouteServiceTravelTimesLiveTests {

	private static final List<Coordinate> BEIRUT = List.of(
			new Coordinate(33.896, 35.484), // Verdun
			new Coordinate(33.8965, 35.4795), // Hamra
			new Coordinate(33.8886, 35.5189)); // Achrafieh

	@Test
	void realRoadTimesBetweenBeirutPointsAreSensibleAndNotStraightLine() {
		OpenRouteServiceTravelTimes client = new OpenRouteServiceTravelTimes(RestClient.builder(),
				new OpenRouteServiceProperties("https://api.openrouteservice.org", System.getenv("ORS_API_KEY"),
						Duration.ofSeconds(10)),
				new StraightLineTravelTimes());

		Duration[][] matrix = client.matrix(BEIRUT);

		for (int i = 0; i < 3; i++) {
			assertEquals(Duration.ZERO, matrix[i][i]);
			for (int j = 0; j < 3; j++) {
				if (i != j) {
					long minutes = matrix[i][j].toMinutes();
					assertTrue(minutes >= 1 && minutes <= 60, i + "->" + j + " took " + minutes + " min");
				}
			}
		}
		assertFalse(Arrays.deepEquals(new StraightLineTravelTimes().matrix(BEIRUT), matrix),
				"these are the straight-line numbers: the fallback answered, not the provider");
	}
}
