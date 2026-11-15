package com.wassel.backend.inbox.service;

import com.wassel.backend.inbox.entity.DeliveryReason;
import com.wassel.backend.inbox.entity.DeliveryStatus;
import com.wassel.backend.common.Parallel;
import com.wassel.backend.inbox.entity.NotificationDelivery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.TestPropertySource;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-283, "The daily cap" in docs/contracts/notification-delivery.md, with the cap set to 2. Its own class because
 * the property makes one more Spring context (if "too many clients" appears, see backend/CLAUDE.md, Tests).
 */
@ExtendWith(OutputCaptureExtension.class)
@TestPropertySource(properties = "wassel.notifications.email.daily-cap=2")
class NotificationDeliveryCapTests extends DeliverySupport {

	@Test
	void aDeliveryOverTheDaysCapIsSkippedAndTheDayAfterSendsAgain() throws Exception {
		List<Scene> children = aStartedMorningRun("Lina", "Omar", "Maya", "Sami");
		setNow(LocalDate.of(2026, 11, 4), LocalTime.of(23, 30));
		tap(children.get(0), "PICKED_UP");
		tap(children.get(1), "PICKED_UP");
		deliveries.deliverDue();
		assertEquals(2, count(DeliveryStatus.SENT));

		setNow(LocalDate.of(2026, 11, 4), LocalTime.of(23, 40));
		tap(children.get(2), "PICKED_UP");
		deliveries.deliverDue();

		assertEquals(2, mailer.sent().size(), "the cap of two is reached");
		assertEquals(1, count(DeliveryStatus.SKIPPED));
		NotificationDelivery capped = deliveryOf(children.get(2).parent());
		assertEquals(DeliveryStatus.SKIPPED, capped.getStatus());
		assertEquals(DeliveryReason.DAILY_CAP, capped.getReason());
		// The cap is checked before the claim: a capped delivery never counted as an attempt.
		assertEquals(0, capped.getAttempts());
		assertNull(capped.getClaimedAt());

		// Entered before midnight, looked at after it: a new day, a new count.
		setNow(LocalDate.of(2026, 11, 4), LocalTime.of(23, 55));
		tap(children.get(3), "PICKED_UP");
		setNow(LocalDate.of(2026, 11, 5), LocalTime.of(0, 5));
		deliveries.deliverDue();

		assertEquals(3, mailer.sent().size());
		assertEquals(3, count(DeliveryStatus.SENT));
	}

	@Test
	void aSendInProgressCountsTowardsTheCap() throws Exception {
		List<Scene> children = aStartedMorningRun("Lina", "Omar", "Maya");
		tap(children.get(0), "PICKED_UP");
		inFlight(children.get(0));

		tap(children.get(1), "PICKED_UP");
		deliveries.deliverDue();
		assertEquals(1, mailer.sent().size());

		tap(children.get(2), "PICKED_UP");
		deliveries.deliverDue();

		assertEquals(1, mailer.sent().size(), "one sent and one in flight make the cap of two");
		assertEquals(1, count(DeliveryStatus.SKIPPED));
	}

	@Test
	void aFailedAttemptCountsTowardsTheCapSoARetryCanHitItOnItsSecondAttempt() throws Exception {
		List<Scene> children = aStartedMorningRun("Lina", "Omar");
		tap(children.get(0), "PICKED_UP");
		mailer.refuseNext(1);
		deliveries.deliverDue();
		assertEquals(1, mailer.calls(), "Lina's first attempt reached the provider and failed");

		tap(children.get(1), "PICKED_UP");
		later(Duration.ofMinutes(1));
		deliveries.deliverDue();

		// Omar's entry is older than Lina's retry, so he goes first; with her failed attempt that is the cap of two.
		assertEquals(2, mailer.calls(), "the retry never reached the provider");
		assertEquals(1, mailsTo(children.get(1).parent()).size());
		NotificationDelivery retry = deliveryOf(children.get(0).parent());
		assertEquals(DeliveryStatus.SKIPPED, retry.getStatus());
		assertEquals(DeliveryReason.DAILY_CAP, retry.getReason());
		assertEquals(1, retry.getAttempts());
	}

	@Test
	void aDeliveryThatNeededARetryCountsEveryAttemptEvenWhenSent() throws Exception {
		List<Scene> children = aStartedMorningRun("Lina", "Omar");
		tap(children.get(0), "PICKED_UP");
		mailer.refuseNext(1);
		deliveries.deliverDue();
		later(Duration.ofMinutes(1));
		deliveries.deliverDue();
		assertEquals(2, deliveryRepository.countAttemptsSince(clock.instant().minus(Duration.ofHours(1))),
				"one send that took two attempts used two of the cap");

		tap(children.get(1), "PICKED_UP");
		deliveries.deliverDue();

		assertEquals(0, mailsTo(children.get(1).parent()).size());
		assertEquals(DeliveryReason.DAILY_CAP, deliveryOf(children.get(1).parent()).getReason());
	}

	@Test
	void theOldestEntriesTakeTheSlotsAndTheCapIsLoggedOnceWithoutPrivateData(CapturedOutput output) throws Exception {
		List<Scene> children = aStartedMorningRun("Lina", "Omar", "Maya", "Sami", "Rami");
		for (Scene child : children) {
			tap(child, "PICKED_UP");
			later(Duration.ofSeconds(1));
		}

		deliveries.deliverDue();

		assertEquals(2, sentMails());
		assertEquals(1, mailsTo(children.get(0).parent()).size());
		assertEquals(1, mailsTo(children.get(1).parent()).size());
		assertEquals(3, count(DeliveryStatus.SKIPPED));
		String ours = ourLog(output);
		assertEquals(1, ours.split("The daily cap of 2 notification emails is reached", -1).length - 1,
				"one warning for the whole tick");
		assertNothingPrivateIn(output, children.get(2).parent(), "Lina", "Omar", "Maya", "Sami", "Rami");
	}

	@Test
	void twoSendersAtTheSameInstantNeverGoOverTheCap() throws Exception {
		List<Scene> children = aStartedMorningRun("Lina", "Omar", "Maya", "Sami", "Rami", "Nour");
		for (Scene child : children) {
			tap(child, "PICKED_UP");
		}
		Callable<Integer> senderRun = () -> deliveries.deliverDue();

		Parallel.inParallel(List.of(senderRun, senderRun));

		assertEquals(2, sentMails(), "the cap of two holds across two senders");
		assertEquals(2, mailer.calls());
		assertEquals(4, count(DeliveryStatus.SKIPPED));
		assertTrue(theDeliveries().stream().allMatch(d -> d.getAttempts() <= 1));
	}

	@Test
	void theCapCheckAndTheClaimWaitForTheLockSoTwoInstancesTakeTurns() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		ExecutorService pool = Executors.newFixedThreadPool(2);
		CountDownLatch held = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		try {
			// Another instance is between its cap check and its claim: it holds the lock until its transaction ends.
			Future<?> otherInstance = pool.submit(() -> transactions.execute(status -> {
				deliveryRepository.lockForCap(NotificationDeliveryService.CAP_LOCK);
				held.countDown();
				try {
					release.await(30, TimeUnit.SECONDS);
				}
				catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
				return null;
			}));
			assertTrue(held.await(30, TimeUnit.SECONDS));

			Future<Integer> sender = pool.submit(() -> deliveries.deliverDue());
			Thread.sleep(1500);
			assertFalse(sender.isDone(), "the sender must wait for the other instance's cap check and claim");
			assertEquals(0, sentMails());

			release.countDown();
			otherInstance.get(30, TimeUnit.SECONDS);
			assertEquals(1, sender.get(30, TimeUnit.SECONDS));
			assertEquals(1, sentMails());
		}
		finally {
			release.countDown();
			pool.shutdownNow();
		}
	}
}
