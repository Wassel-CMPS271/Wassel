package com.wassel.backend.runs.config;

import com.wassel.backend.common.LiveRunCriteriaSupport;
import com.wassel.backend.runs.entity.RunLocation;
import com.wassel.backend.runs.repository.RunLocationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-272, for SCRUM-261: the retention of a position, which the ticket lists with consent, ownership and freshness.
 * The contract says a withdrawal "removes the position at once", that ending a run withdraws consent and removes the
 * position "in the same step", and that a position older than five minutes "is no longer shown and is removed within a
 * minute", also for a run nobody ends. Whether a position is still stored cannot be seen through the API (an old one is
 * simply not shown), so these tests read the stored row, the one place in these suites that does.
 *
 * <p>The clean-up job is not a bean in the {@code test} profile, so that a background run cannot empty a position in the
 * middle of a test; it is built by hand here and run as the scheduler would, once, with the test clock.
 */
class LocationRetentionCriteriaTests extends LiveRunCriteriaSupport {

	@Autowired
	private RunLocationRepository runLocationRepository;

	@Autowired
	private TransactionTemplate transactionTemplate;

	private RunLocation stored(String run) {
		return runLocationRepository.findBySchoolIdAndRunId(school, UUID.fromString(run)).orElseThrow();
	}

	private void cleanUp() {
		LocationPurge job = new LocationPurge(runLocationRepository, clock);
		transactionTemplate.executeWithoutResult(status -> job.purge());
	}

	private static void assertNoPosition(RunLocation row, String message) {
		assertNull(row.getLatitude(), message);
		assertNull(row.getLongitude(), message);
		assertNull(row.getAccuracyMeters(), message);
		assertNull(row.getReceivedAt(), message);
	}

	@Test
	void aWithdrawalRemovesTheStoredPositionAtOnce() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), BEFORE_FIRST);
		assertNotNull(stored(t.run()).getLatitude(), "stored while shared");

		assertEquals(200, share(t.bus(), t.run(), false).getStatus());

		RunLocation row = stored(t.run());
		assertFalse(row.isSharing());
		assertNoPosition(row, "withdrawing removes the position at once, not at the next clean-up");
	}

	@Test
	void endingARunRemovesTheStoredPositionAndConsentInTheSameStep() throws Exception {
		Trip t = aStartedTrip("Hamra morning run");
		assertEquals(200, share(t.bus(), t.run(), true).getStatus());
		fix(t.bus(), t.run(), BEFORE_FIRST);

		assertEquals(200, end(t.bus(), t.run()).getStatus());

		RunLocation row = stored(t.run());
		assertFalse(row.isSharing());
		assertNoPosition(row, "the end withdraws consent and removes the position");
	}

	@Test
	void theCleanUpRemovesAPositionOlderThanFiveMinutesEvenForARunNobodyEndsAndNeverOneThatIsStillShown() throws Exception {
		Trip old = aStartedTrip("Hamra morning run");
		Trip fresh = aStartedTrip("Verdun morning run");
		assertEquals(200, share(old.bus(), old.run(), true).getStatus());
		fix(old.bus(), old.run(), BEFORE_FIRST);
		later(2 * 60);
		assertEquals(200, share(fresh.bus(), fresh.run(), true).getStatus());
		fix(fresh.bus(), fresh.run(), BEFORE_FIRST);

		later(3 * 60 - 1);
		cleanUp();
		assertNotNull(stored(old.run()).getLatitude(), "299 seconds old is still shown as STALE, so it is not removed");
		assertNotNull(stored(fresh.run()).getLatitude());

		later(2);
		cleanUp();
		RunLocation removed = stored(old.run());
		assertNoPosition(removed, "301 seconds old: no longer shown, and removed by the clean-up");
		assertTrue(removed.isSharing(), "the run is still in progress, nobody ended it, and consent is not the clean-up's business");
		assertNotNull(stored(fresh.run()).getLatitude(), "a position that is not old enough is kept");
		assertEquals("STALE", com.jayway.jsonpath.JsonPath.read(parentSees(fresh.parentOfFirst(), fresh.first()), "$.status"));

		later(3 * 60);
		cleanUp();
		assertNoPosition(stored(fresh.run()), "and it goes when it is old enough, in the same way");
	}
}
