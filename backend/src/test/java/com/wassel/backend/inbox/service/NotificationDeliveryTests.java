package com.wassel.backend.inbox.service;

import com.wassel.backend.common.Parallel;
import com.wassel.backend.inbox.entity.DeliveryReason;
import com.wassel.backend.inbox.entity.DeliveryStatus;
import com.wassel.backend.inbox.entity.NotificationDelivery;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.file.Files;
import java.time.Duration;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-283, docs/contracts/notification-delivery.md: the email that goes with an inbox entry. Everything is real
 * (PostgreSQL from the Flyway migrations, the driver's endpoints, the services); only the mail provider is a
 * {@link RecordingMailer}, and the clock is moved to reach the retry delays.
 */
@ExtendWith(OutputCaptureExtension.class)
class NotificationDeliveryTests extends DeliverySupport {

	private static final String SUBJECT = "Wassel: an update about your child";

	@Autowired
	private Environment environment;

	// ---------------------------------------------------------------- what is sent

	@Test
	void aPickupIsEmailedOnceToTheParentWithTheFirstNameTheTimeAndALinkAndNothingElse() throws Exception {
		Scene lina = aChild("Lina");
		setNow(WEDNESDAY, LocalTime.of(7, 12));
		tap(lina, "PICKED_UP");

		deliveries.deliverDue();

		assertEquals(1, sentMails());
		RecordingMailer.Mail mail = mailer.sent().get(0);
		assertEquals(emailOf(lina.parent()), mail.to());
		assertEquals(SUBJECT, mail.subject());
		assertEquals("Lina was picked up this morning at 07:12.\n\n"
				+ "See the details in your Wassel inbox: http://localhost:3000/parent", mail.body());
		assertFalse(mail.subject().contains("Lina"), "a subject shows on a lock screen");
		assertFalse(mail.body().contains("Nasr") || mail.body().contains("Street"), "no surname and no address");
		NotificationDelivery delivery = theDelivery();
		assertEquals(DeliveryStatus.SENT, delivery.getStatus());
		assertEquals(1, delivery.getAttempts());
		assertNotNull(delivery.getSentAt());
	}

	@Test
	void theEmailIsTheContractSample() throws Exception {
		Scene lina = aChild("Lina");
		setNow(WEDNESDAY, LocalTime.of(7, 12));
		tap(lina, "PICKED_UP");

		deliveries.deliverDue();

		String sample = Files.readString(SAMPLES.resolve("email-picked-up.txt")).replace("https://wassel.example",
				"http://localhost:3000");
		RecordingMailer.Mail mail = mailer.sent().get(0);
		assertEquals(sample.strip(), ("Subject: " + mail.subject() + "\n\n" + mail.body()).strip());
	}

	@ParameterizedTest
	@CsvSource(delimiter = '|', value = {
			"PICKED_UP|MORNING|Lina was picked up this morning at 07:00.",
			"PICKED_UP|AFTERNOON|Lina was picked up this afternoon at 07:00.",
			"DROPPED_OFF|MORNING|Lina was dropped off this morning at 07:00.",
			"NOT_PRESENT|MORNING|Lina was not at the stop this morning at 07:00.",
			"LATE|MORNING|Lina is running late for this morning's pickup (07:50)." })
	void everyTypeHasItsWording(String type, String direction, String sentence) throws Exception {
		Scene lina = aChild("Lina");
		if ("LATE".equals(type)) {
			aLateAlert();
		}
		else if ("AFTERNOON".equals(direction)) {
			anAfternoonTap(lina, type);
		}
		else {
			aMorningTap(lina, type);
		}

		deliveries.deliverDue();

		List<RecordingMailer.Mail> mails = mailsTo(lina.parent());
		assertEquals(1, mails.size());
		assertEquals(sentence + "\n\nSee the details in your Wassel inbox: http://localhost:3000/parent",
				mails.get(0).body());
	}

	private void aLateAlert() {
		setNow(WEDNESDAY, LocalTime.of(7, 50));
		lateAlerts.raise();
		// One database for every test: children still waiting on other schools' runs got alerts too, and their
		// entries would crowd this one out of the sender's batch of 20.
		inboxRepository.findAll().stream().filter(entry -> !entry.getSchoolId().equals(school))
				.forEach(inboxRepository::delete);
	}

	private void anAfternoonTap(Scene lina, String type) throws Exception {
		String afternoon = runId(lina.bus(), "AFTERNOON");
		assertEquals(200, start(lina.bus(), afternoon).getStatus());
		assertEquals(200, confirm(lina.bus(), afternoon, lina.child(), type).getStatus());
	}

	/** A dropped-off needs a pickup first (the transition table), and that email is not what the test looks at. */
	private void aMorningTap(Scene lina, String type) throws Exception {
		if ("DROPPED_OFF".equals(type)) {
			tap(lina, "PICKED_UP");
			deliveries.deliverDue();
			mailer.reset();
		}
		tap(lina, type);
	}

	// ---------------------------------------------------------------- at most once

	@Test
	void aRepeatedJobAndAReplayedConfirmationStillSendOneEmail() throws Exception {
		Scene lina = aChild("Lina");
		String body = "{\"status\":\"PICKED_UP\",\"clientRequestId\":\"%s\"}".formatted(UUID.randomUUID());
		for (int i = 0; i < 2; i++) {
			MockHttpServletResponse response = send(put(
					"/api/driver/runs/" + lina.run() + "/students/" + lina.child() + "/confirmation")
					.with(as(Role.DRIVER, lina.bus().driverUserId())).contentType(MediaType.APPLICATION_JSON)
					.content(body));
			assertEquals(200, response.getStatus(), response.getContentAsString());
		}

		for (int i = 0; i < 3; i++) {
			deliveries.deliverDue();
		}

		assertEquals(1, sentMails());
		assertEquals(1, theDeliveries().size());
	}

	@Test
	void twoSendersAtTheSameInstantSendOneEmail() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");

		Callable<Integer> senderRun = () -> {
			deliveries.deliverDue();
			return 0;
		};
		Parallel.inParallel(List.of(senderRun, senderRun));

		assertEquals(1, sentMails());
		assertEquals(1, theDelivery().getAttempts());
		assertEquals(DeliveryStatus.SENT, theDelivery().getStatus());
	}

	@Test
	void aSendInterruptedAfterFiveMinutesIsFailedAndNeverSent() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		// A crash mid-send leaves a SENDING row; the repository's own statements make one.
		inFlight(lina);

		later(Duration.ofMinutes(5));
		deliveries.deliverDue();
		assertEquals(DeliveryStatus.SENDING, theDelivery().getStatus(), "exactly five minutes is not more than five");

		later(Duration.ofSeconds(1));
		deliveries.deliverDue(); // the first run of the second ends it, the next finds nothing more
		deliveries.deliverDue();

		assertEquals(DeliveryStatus.FAILED, theDelivery().getStatus());
		assertEquals(DeliveryReason.INTERRUPTED, theDelivery().getReason());
		assertEquals(0, mailer.calls());
	}

	@Test
	void theSweepsLogHowManyDeliveriesTheyEnded(CapturedOutput output) throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		inFlight(lina);
		later(Duration.ofMinutes(6));

		deliveries.deliverDue();

		assertTrue(ourLog(output).contains("1 notification deliveries were interrupted and will not be sent"));
		assertNothingPrivateIn(output, lina.parent(), "Lina");
	}

	// ---------------------------------------------------------------- retry, bound and expiry

	@Test
	void aFailedSendIsRetriedAfterOneThenFiveMinutes() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		mailer.refuseNext(2);

		deliveries.deliverDue();
		assertEquals(1, mailer.calls());
		assertEquals(DeliveryStatus.PENDING, theDelivery().getStatus());

		later(Duration.ofSeconds(59));
		deliveries.deliverDue();
		assertEquals(1, mailer.calls(), "not before one minute");

		later(Duration.ofSeconds(1));
		deliveries.deliverDue();
		assertEquals(2, mailer.calls());

		later(Duration.ofMinutes(5).minusSeconds(1));
		deliveries.deliverDue();
		assertEquals(2, mailer.calls(), "not before five minutes after the second attempt");

		later(Duration.ofSeconds(1));
		deliveries.deliverDue();
		assertEquals(3, mailer.calls());
		assertEquals(1, sentMails());
		assertEquals(DeliveryStatus.SENT, theDelivery().getStatus());
		assertEquals(3, theDelivery().getAttempts());
		assertNull(theDelivery().getReason(), "a sent delivery keeps no reason from its failed attempts");
	}

	@Test
	void afterFourAttemptsTheDeliveryFailsForGoodAndNothingIsSentAgain(CapturedOutput output) throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		mailer.refuseAll(true);

		deliveries.deliverDue();
		later(Duration.ofMinutes(1));
		deliveries.deliverDue();
		later(Duration.ofMinutes(5));
		deliveries.deliverDue();
		later(Duration.ofMinutes(15).minusSeconds(1));
		deliveries.deliverDue();
		assertEquals(3, mailer.calls(), "not before fifteen minutes after the third attempt");
		later(Duration.ofSeconds(1));
		deliveries.deliverDue();

		assertEquals(4, mailer.calls());
		assertEquals(DeliveryStatus.FAILED, theDelivery().getStatus());
		assertEquals(DeliveryReason.PROVIDER_ERROR, theDelivery().getReason());
		assertEquals(4, theDelivery().getAttempts());
		assertTrue(ourLog(output).contains("attempt 4 failed (MailSendException); giving up"));
		assertNothingPrivateIn(output, lina.parent(), "Lina");

		later(Duration.ofMinutes(30));
		mailer.refuseAll(false);
		deliveries.deliverDue();
		assertEquals(4, mailer.calls(), "no fifth attempt");
		assertEquals(0, sentMails());
	}

	@Test
	void theWholeRetryWalkEndsAtTheBound() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		mailer.refuseAll(true);

		walkTheRetries();

		assertEquals(4, mailer.calls());
		assertEquals(DeliveryStatus.FAILED, theDelivery().getStatus());
	}

	@Test
	void aDeliveryNotSentWithinAnHourOfTheEntryExpires() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		mailer.refuseAll(true);
		deliveries.deliverDue();
		mailer.refuseAll(false);

		later(Duration.ofMinutes(61));
		deliveries.deliverDue();

		assertEquals(DeliveryStatus.FAILED, theDelivery().getStatus());
		assertEquals(DeliveryReason.EXPIRED, theDelivery().getReason());
		assertEquals(1, mailer.calls());
	}

	@Test
	void anEntryOlderThanAnHourWhenFirstSeenIsNeverEmailed() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");

		later(Duration.ofMinutes(61));
		deliveries.deliverDue();

		assertEquals(0, theDeliveries().size());
		assertEquals(0, mailer.calls());
	}

	@Test
	void aDeliveryExpiresAtExactlyAnHourAndLogsIt(CapturedOutput output) throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		mailer.refuseAll(true);
		deliveries.deliverDue();

		later(Duration.ofMinutes(60));
		deliveries.deliverDue();

		assertEquals(DeliveryReason.EXPIRED, theDelivery().getReason());
		assertEquals(1, mailer.calls());
		assertTrue(ourLog(output).contains("1 notification deliveries expired unsent"));
	}

	@Test
	void anEntryExactlyAnHourOldWhenFirstSeenIsNeverEmailed() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");

		later(Duration.ofMinutes(60));
		deliveries.deliverDue();

		assertEquals(0, theDeliveries().size());
		assertEquals(0, mailer.calls());
	}

	@Test
	void anEntryJustUnderAnHourOldIsStillEmailed() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");

		later(Duration.ofMinutes(59));
		deliveries.deliverDue();

		assertEquals(1, sentMails());
	}

	// ---------------------------------------------------------------- who is told

	@Test
	void aTypeTurnedOffAfterTheEntryIsNotEmailedButTheEntryStays() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		pickedUpOff(lina.parent());

		deliveries.deliverDue();

		assertEquals(0, mailer.calls());
		assertEquals(DeliveryStatus.SKIPPED, theDelivery().getStatus());
		assertEquals(DeliveryReason.PREFERENCE_OFF, theDelivery().getReason());
		assertEquals(1, inboxSize(lina.parent()));
	}

	@Test
	void aRevokedParentIsNotEmailed() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		revoke(lina.parent());

		deliveries.deliverDue();

		assertEquals(0, mailer.calls());
		assertEquals(DeliveryStatus.SKIPPED, theDelivery().getStatus());
		assertEquals(DeliveryReason.NO_RECIPIENT, theDelivery().getReason());
	}

	@Test
	void aParentWithABlankAddressIsNotEmailed() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		String address = emailOf(lina.parent());
		jdbc.update("UPDATE users SET email = '' WHERE id = ?", lina.parent());
		try {
			deliveries.deliverDue();
		}
		finally {
			jdbc.update("UPDATE users SET email = ? WHERE id = ?", address, lina.parent());
		}

		assertEquals(0, mailer.calls());
		assertEquals(DeliveryStatus.SKIPPED, theDelivery().getStatus());
		assertEquals(DeliveryReason.NO_RECIPIENT, theDelivery().getReason());
	}

	@Test
	void aParentOfAnotherSchoolIsNotEmailed() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		jdbc.update("UPDATE users SET school_id = ? WHERE id = ?", UUID.randomUUID(), lina.parent());

		deliveries.deliverDue();

		assertEquals(0, mailer.calls());
		assertEquals(DeliveryStatus.SKIPPED, theDelivery().getStatus());
		assertEquals(DeliveryReason.NO_RECIPIENT, theDelivery().getReason());
	}

	@Test
	void aChildWhoIsNoLongerInTheEntrysSchoolEndsAtOnceAsNoRecipientAndTheRestStillGo() throws Exception {
		List<Scene> children = aStartedMorningRun("Lina", "Omar");
		tap(children.get(0), "PICKED_UP");
		tap(children.get(1), "PICKED_UP");
		jdbc.update("UPDATE inbox_events SET student_id = ? WHERE parent_user_id = ?", UUID.randomUUID(),
				children.get(0).parent());

		assertEquals(1, deliveries.deliverDue());

		assertEquals(0, mailsTo(children.get(0).parent()).size());
		assertEquals(1, mailsTo(children.get(1).parent()).size());
		NotificationDelivery broken = deliveryOf(children.get(0).parent());
		assertEquals(DeliveryStatus.SKIPPED, broken.getStatus());
		assertEquals(DeliveryReason.NO_RECIPIENT, broken.getReason());
	}

	@Test
	void anEntryThatIsGoneEndsAtOnceAsNoRecipient() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		deliveryRepository.discover(clock.instant().minus(Duration.ofMinutes(60)), clock.instant());
		inboxRepository.deleteAll();

		deliveries.deliverDue();

		assertEquals(0, mailer.calls());
		assertEquals(DeliveryStatus.SKIPPED, theDelivery().getStatus());
		assertEquals(DeliveryReason.NO_RECIPIENT, theDelivery().getReason());
	}

	@Test
	void aChildWithNoParentMakesNoEntryAndNoDelivery() throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID child = aStudent("Lina", null);
		onRoute(bus, child);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		assertEquals(200, confirm(bus, run, child, "PICKED_UP").getStatus());

		deliveries.deliverDue();

		assertEquals(0, theDeliveries().size());
		assertEquals(0, mailer.calls());
	}

	// ---------------------------------------------------------------- the driver is never affected, and nothing leaks

	@Test
	void aMailProviderThatAlwaysFailsDoesNotChangeTheDriversTap() throws Exception {
		mailer.refuseAll(true);
		Scene lina = aChild("Lina");

		tap(lina, "PICKED_UP");
		deliveries.deliverDue();

		assertEquals(1, inboxSize(lina.parent()));
		NotificationDelivery delivery = theDelivery();
		assertEquals(DeliveryStatus.PENDING, delivery.getStatus());
		assertEquals(1, delivery.getAttempts());
		assertEquals(DeliveryReason.PROVIDER_ERROR, delivery.getReason());
	}

	@Test
	void theLogsHoldIdsAttemptsAndTheErrorClassButNeverTheAddressANameOrTheText(CapturedOutput output)
			throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		mailer.refuseNext(1);

		deliveries.deliverDue();
		later(Duration.ofMinutes(1));
		deliveries.deliverDue();

		assertEquals(1, sentMails());
		String ours = ourLog(output);
		String id = theDelivery().getId().toString();
		assertTrue(ours.contains(id), "the delivery id is logged");
		assertTrue(ours.contains("MailSendException"), "the error class is logged");
		assertTrue(ours.contains("attempt 1"), "the attempt number is logged");
		assertNothingPrivateIn(output, lina.parent(), "Lina");
	}

	// ---------------------------------------------------------------- when something goes wrong inside the sender

	@Test
	void aDeliveryThatFailsBeforeTheSendDoesNotStopTheOthersAndLogsTheClassOnly(CapturedOutput output)
			throws Exception {
		List<Scene> children = aStartedMorningRun("Lina", "Omar");
		tap(children.get(0), "PICKED_UP");
		tap(children.get(1), "PICKED_UP");
		// An entry the sender cannot read: its direction is not one of the two.
		jdbc.update("UPDATE inbox_events SET direction = 'SIDEWAYS' WHERE parent_user_id = ?",
				children.get(0).parent());

		assertEquals(1, deliveries.deliverDue());

		assertEquals(1, mailsTo(children.get(1).parent()).size(), "the other delivery still went out");
		assertEquals(0, mailsTo(children.get(0).parent()).size());
		NotificationDelivery broken = deliveryOf(children.get(0).parent());
		assertEquals(DeliveryStatus.SENDING, broken.getStatus());
		assertEquals(1, broken.getAttempts());
		String ours = ourLog(output);
		assertTrue(ours.contains("Delivery " + broken.getId() + " failed unexpectedly (IllegalArgumentException)"));
		assertFalse(ours.contains("SIDEWAYS"), "the exception's message is never logged");
		assertFalse(ours.contains("\tat "), "no stack trace");
		assertNothingPrivateIn(output, children.get(0).parent(), "Lina", "Omar");

		later(Duration.ofMinutes(6));
		deliveries.deliverDue();
		NotificationDelivery ended = deliveryOf(children.get(0).parent());
		assertEquals(DeliveryStatus.FAILED, ended.getStatus());
		assertEquals(DeliveryReason.INTERRUPTED, ended.getReason());
		assertEquals(0, mailsTo(children.get(0).parent()).size(), "never retried");
	}

	@Test
	void aSendThatFinishesAfterASweepStillSendsLogsItAndTheRowStaysEnded(CapturedOutput output) throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		// The provider is slow: while it answers, the delivery has been in flight for six minutes and a sweep ends it.
		mailer.whileSending(() -> {
			later(Duration.ofMinutes(6));
			deliveryRepository.interrupt(clock.instant().minus(Duration.ofMinutes(5)));
		});

		assertEquals(1, deliveries.deliverDue());

		assertEquals(1, sentMails());
		assertEquals(DeliveryStatus.FAILED, theDelivery().getStatus());
		assertEquals(DeliveryReason.INTERRUPTED, theDelivery().getReason());
		assertTrue(ourLog(output).contains("was sent but was no longer SENDING when it finished"));
		assertNothingPrivateIn(output, lina.parent(), "Lina");
	}

	@Test
	void aRetryThatFindsTheRowSweptSaysSoInsteadOfPromisingARetry(CapturedOutput output) throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		mailer.refuseAll(true);
		mailer.whileSending(() -> {
			later(Duration.ofMinutes(6));
			deliveryRepository.interrupt(clock.instant().minus(Duration.ofMinutes(5)));
		});

		deliveries.deliverDue();

		String ours = ourLog(output);
		assertTrue(ours.contains("but the row was no longer SENDING; no retry is planned"));
		assertFalse(ours.contains("retry at"));
		assertEquals(DeliveryStatus.FAILED, theDelivery().getStatus());
	}

	@Test
	void aFailureOutsideOneDeliveryIsLoggedWithTheClassOnlyAndTheRunCarriesOn(CapturedOutput output) {
		// Inside one transaction the table is renamed, so the sender's first statement fails; then everything is rolled back.
		Integer sent = transactions.execute(status -> {
			jdbc.execute("ALTER TABLE notification_deliveries RENAME TO notification_deliveries_gone");
			int answered = deliveries.deliverDue();
			status.setRollbackOnly();
			return answered;
		});

		assertEquals(0, sent);
		String ours = ourLog(output);
		assertTrue(ours.contains("A notification delivery run failed ("), ours);
		assertFalse(ours.contains("does not exist"), "the exception's message is never logged");
		assertFalse(ours.contains("\tat "), "no stack trace");
		assertEquals(0, theDeliveries().size());
	}

	// ---------------------------------------------------------------- order, the stored rows, and the scheduler

	@Test
	void theOldestEntriesAreSentFirst() throws Exception {
		List<Scene> children = aStartedMorningRun("Lina", "Omar", "Maya", "Sami", "Rami", "Nour", "Hadi", "Dina");
		for (Scene child : children) {
			tap(child, "PICKED_UP");
			later(Duration.ofSeconds(1));
		}
		deliveryRepository.discover(clock.instant().minus(Duration.ofMinutes(60)), clock.instant());

		List<UUID> due = deliveryRepository.findDueIds(clock.instant(), 20);

		List<UUID> expected = theDeliveries().stream()
				.sorted(Comparator.comparing(d -> inboxRepository.findById(d.getInboxEventId()).orElseThrow()
						.getCreatedAt()))
				.map(NotificationDelivery::getId).toList();
		assertEquals(8, due.size());
		assertEquals(expected, due);
	}

	@Test
	void aTickSendsAtMostABatchAndTheRestGoOnTheNextTick() throws Exception {
		String[] names = new String[NotificationDeliveryService.BATCH + 5];
		for (int i = 0; i < names.length; i++) {
			names[i] = "Child" + i;
		}
		for (Scene child : aStartedMorningRun(names)) {
			tap(child, "PICKED_UP");
		}

		assertEquals(NotificationDeliveryService.BATCH, deliveries.deliverDue());
		assertEquals(5, deliveries.deliverDue());
		assertEquals(0, deliveries.deliverDue());
		assertEquals(names.length, sentMails());
	}

	@Test
	void theDatabaseRefusesAReasonItDoesNotKnowAndASentRowWithoutATime() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		deliveryRepository.discover(clock.instant().minus(Duration.ofMinutes(60)), clock.instant());
		UUID id = theDelivery().getId();

		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE notification_deliveries SET reason = 'BOGUS' WHERE id = ?", id));
		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE notification_deliveries SET status = 'SENT' WHERE id = ?", id));
		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE notification_deliveries SET attempts = -1 WHERE id = ?", id));
	}

	@Test
	void theScheduledJobsDoNotShareASingleThread() {
		Integer size = environment.getProperty("spring.task.scheduling.pool.size", Integer.class);
		assertNotNull(size, "spring.task.scheduling.pool.size is not set, so Spring uses one thread");
		assertTrue(size >= 3, "late alerts, the location purge and the email sender each need a thread: " + size);
	}
}
