package com.wassel.backend.routing.service;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class StraightLineTravelTimesTests {

	private final StraightLineTravelTimes travelTimes = new StraightLineTravelTimes();

	// 0.1 degrees of latitude is about 11.12 km, which is 22.24 minutes at 30 km/h, rounded up.
	private static final Coordinate ORIGIN = new Coordinate(0, 0);
	private static final Coordinate TENTH_OF_A_DEGREE_NORTH = new Coordinate(0.1, 0);

	@Test
	void aKnownDistanceIsTimedAtThirtyKilometresAnHourRoundedUp() {
		Duration[][] matrix = travelTimes.matrix(List.of(ORIGIN, TENTH_OF_A_DEGREE_NORTH));

		assertEquals(Duration.ofMinutes(23), matrix[0][1]);
	}

	@Test
	void theMatrixIsSquareInInputOrderWithAZeroDiagonal() {
		Coordinate far = new Coordinate(0.2, 0);

		Duration[][] matrix = travelTimes.matrix(List.of(ORIGIN, TENTH_OF_A_DEGREE_NORTH, far));

		assertEquals(3, matrix.length);
		for (int i = 0; i < 3; i++) {
			assertEquals(3, matrix[i].length);
			assertEquals(Duration.ZERO, matrix[i][i]);
			for (int j = 0; j < 3; j++) {
				assertNotNull(matrix[i][j]);
			}
		}
		assertEquals(Duration.ofMinutes(45), matrix[0][2]);
		assertEquals(matrix[0][2], matrix[2][0]);
	}

	@Test
	void twoStudentsAtTheSamePointAreZeroMinutesApart() {
		Duration[][] matrix = travelTimes.matrix(List.of(TENTH_OF_A_DEGREE_NORTH, TENTH_OF_A_DEGREE_NORTH));

		assertEquals(Duration.ZERO, matrix[0][1]);
		assertEquals(Duration.ZERO, matrix[1][0]);
	}

	@Test
	void noPointsGiveAnEmptyMatrix() {
		assertEquals(0, travelTimes.matrix(List.of()).length);
	}

	@Test
	void outOfRangeCoordinatesAreRejected() {
		assertThrows(IllegalArgumentException.class, () -> new Coordinate(90.1, 0));
		assertThrows(IllegalArgumentException.class, () -> new Coordinate(0, -180.1));
		assertThrows(IllegalArgumentException.class, () -> new Coordinate(Double.NaN, 0));
	}
}
