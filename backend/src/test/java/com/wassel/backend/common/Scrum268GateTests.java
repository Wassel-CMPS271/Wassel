package com.wassel.backend.common;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-266: the switch behind the two SCRUM-268 suites must not be able to skip them for ever without a signal. If #158
 * renames or moves one of its classes before it merges, the gate must fail loudly instead of reading "not merged yet".
 * Plain unit tests, no Spring context, never skipped.
 */
class Scrum268GateTests {

	@Test
	void noneOfTheClassesMeansNotMergedYet() {
		assertFalse(Scrum268Gate.decide(name -> false));
	}

	@Test
	void allOfTheClassesMeansMerged() {
		assertTrue(Scrum268Gate.decide(name -> true));
	}

	@Test
	void anyOneClassMissingFailsLoudlyAndNamesIt() {
		for (String renamed : Scrum268Gate.CLASSES) {
			IllegalStateException failure = assertThrows(IllegalStateException.class,
					() -> Scrum268Gate.decide(name -> !name.equals(renamed)), "only " + renamed + " is missing");
			assertTrue(failure.getMessage().contains(renamed), failure.getMessage());
		}
	}

	@Test
	void anyOneClassAloneFailsLoudly() {
		for (String only : Scrum268Gate.CLASSES) {
			assertThrows(IllegalStateException.class, () -> Scrum268Gate.decide(Set.of(only)::contains),
					"only " + only + " is present");
		}
	}

	/** On the real classpath the answer is a clean yes or no: a half-merged state would fail this test as well. */
	@Test
	void theRealClasspathIsEitherAllThereOrNoneOfIt() {
		assertDoesNotThrow(Scrum268Gate::built);
	}

}
