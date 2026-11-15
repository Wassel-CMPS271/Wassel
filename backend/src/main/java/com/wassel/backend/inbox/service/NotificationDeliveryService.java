package com.wassel.backend.inbox.service;

import com.wassel.backend.auth.service.Mailer;
import com.wassel.backend.inbox.config.NotificationDeliveryProperties;
import com.wassel.backend.inbox.dto.NotificationDeliverySummaryResponse;
import com.wassel.backend.inbox.entity.DeliveryReason;
import com.wassel.backend.inbox.entity.DeliveryStatus;
import com.wassel.backend.inbox.entity.InboxEvent;
import com.wassel.backend.inbox.entity.NotificationDelivery;
import com.wassel.backend.inbox.repository.InboxEventRepository;
import com.wassel.backend.inbox.repository.NotificationDeliveryRepository;
import com.wassel.backend.runs.entity.RunDirection;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.exception.StudentNotFoundException;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

/**
 * Emails the parent about an inbox entry (SCRUM-283, docs/contracts/notification-delivery.md). {@link #deliverDue} is the
 * whole job and is safe to call as often as you like and from several instances: a delivery is made once per entry (the
 * unique key) and one caller wins each attempt (a conditional update), so two callers never send the same attempt. It is
 * deliberately not transactional: every statement is its own short transaction, so none is open while the mail provider is
 * called (the {@code RunService.confirm} pattern); the one exception is the cap check and the claim, one short transaction
 * with no provider call in it. The attempt is counted when it is claimed, so a crash mid-send is never retried (the row is
 * later ended as {@code INTERRUPTED}). A provider error is retried, and a provider that accepted an email and then timed out
 * is an error like any other, so that one email can arrive twice: at most once holds against a crash, not against a
 * timeout. The driver's confirmation never touches this: entries are found here, not pushed. Logs carry ids, the attempt
 * number and the exception's class, never an address, a name, the text or the provider's message (it can hold the address).
 */
@Slf4j
@Service
public class NotificationDeliveryService {

	/** The wait after a failed attempt 1, 2 and 3. */
	static final List<Duration> RETRY_DELAYS = List.of(Duration.ofMinutes(1), Duration.ofMinutes(5),
			Duration.ofMinutes(15));

	static final int MAX_ATTEMPTS = RETRY_DELAYS.size() + 1;

	/** Also how far back an entry is looked for: an entry older than this is never emailed. */
	static final Duration EXPIRES_AFTER = Duration.ofMinutes(60);

	static final Duration INTERRUPTED_AFTER = Duration.ofMinutes(5);

	static final int BATCH = 20;

	/** The advisory lock that makes the cap check and the claim one step across instances. */
	static final long CAP_LOCK = 283_001L;

	private enum Claim {
		CLAIMED, CAPPED, LOST
	}

	private final NotificationDeliveryRepository deliveryRepository;

	private final InboxEventRepository eventRepository;

	private final UserService userService;

	private final StudentService studentService;

	private final NotificationPreferenceService preferenceService;

	private final Mailer mailer;

	private final NotificationDeliveryProperties properties;

	private final Clock clock;

	private final TransactionTemplate transactions;

	private final String frontendBaseUrl;

	public NotificationDeliveryService(NotificationDeliveryRepository deliveryRepository,
			InboxEventRepository eventRepository, UserService userService, StudentService studentService,
			NotificationPreferenceService preferenceService, Mailer mailer, NotificationDeliveryProperties properties,
			Clock clock, TransactionTemplate transactions, @Value("${wassel.frontend-base-url}") String frontendBaseUrl) {
		this.deliveryRepository = deliveryRepository;
		this.eventRepository = eventRepository;
		this.userService = userService;
		this.studentService = studentService;
		this.preferenceService = preferenceService;
		this.mailer = mailer;
		this.properties = properties;
		this.clock = clock;
		this.transactions = transactions;
		this.frontendBaseUrl = frontendBaseUrl;
	}

	/**
	 * Finds the new entries, sends what is due and answers how many emails it sent. It never throws: a failure outside one
	 * delivery (the database, say) is logged with the exception's class only, never the exception (its message can hold
	 * SQL and values), and the next run carries on.
	 */
	public int deliverDue() {
		try {
			return run();
		}
		catch (RuntimeException e) {
			log.error("A notification delivery run failed ({}); the next run carries on", e.getClass().getSimpleName());
			return 0;
		}
	}

	private int run() {
		Instant now = Instant.now(clock);
		int expired = deliveryRepository.expire(now.minus(EXPIRES_AFTER));
		if (expired > 0) {
			log.warn("{} notification deliveries expired unsent", expired);
		}
		int interrupted = deliveryRepository.interrupt(now.minus(INTERRUPTED_AFTER));
		if (interrupted > 0) {
			log.warn("{} notification deliveries were interrupted and will not be sent", interrupted);
		}
		deliveryRepository.discover(now.minus(EXPIRES_AFTER), now);
		Instant dayStart = LocalDate.now(clock).atStartOfDay(clock.getZone()).toInstant();
		int sent = 0;
		boolean capLogged = false;
		for (UUID id : deliveryRepository.findDueIds(now, BATCH)) {
			try {
				Claim claim = claim(id, now, dayStart);
				if (claim == Claim.CAPPED && !capLogged) {
					log.warn("The daily cap of {} notification emails is reached; the rest are skipped",
							properties.dailyCap());
					capLogged = true;
				}
				if (claim == Claim.CLAIMED && deliver(id)) {
					sent++;
				}
			}
			catch (RuntimeException e) {
				// The row stays SENDING and is ended as INTERRUPTED later. Not logged with the exception: its message can hold the address.
				log.error("Delivery {} failed unexpectedly ({}); it will not be retried", id, e.getClass().getSimpleName());
			}
		}
		return sent;
	}

	/** The cap check and the claim, one step at a time across instances, so two of them cannot both take the last slot. */
	private Claim claim(UUID id, Instant now, Instant dayStart) {
		return transactions.execute(status -> {
			deliveryRepository.lockForCap(CAP_LOCK);
			if (deliveryRepository.countAttemptsSince(dayStart) >= properties.dailyCap()) {
				int ended = deliveryRepository.end(id, DeliveryStatus.PENDING, DeliveryStatus.SKIPPED,
						DeliveryReason.DAILY_CAP);
				return ended == 1 ? Claim.CAPPED : Claim.LOST;
			}
			return deliveryRepository.claim(id, now) == 1 ? Claim.CLAIMED : Claim.LOST;
		});
	}

	private boolean deliver(UUID id) {
		NotificationDelivery delivery = deliveryRepository.findById(id).orElseThrow();
		Optional<InboxEvent> found = eventRepository.findById(delivery.getInboxEventId());
		if (found.isEmpty()) {
			skip(id, DeliveryReason.NO_RECIPIENT);
			return false;
		}
		InboxEvent event = found.get();
		User parent = userService.findInSchool(delivery.getSchoolId(), event.getParentUserId()).filter(User::isEnabled)
				.filter(p -> p.getEmail() != null && !p.getEmail().isBlank()).orElse(null);
		if (parent == null) {
			skip(id, DeliveryReason.NO_RECIPIENT);
			return false;
		}
		if (!preferenceService.receives(delivery.getSchoolId(), parent.getId(), event.getType())) {
			skip(id, DeliveryReason.PREFERENCE_OFF);
			return false;
		}
		StudentResponse child;
		try {
			child = studentService.getStudent(delivery.getSchoolId(), event.getStudentId());
		}
		catch (StudentNotFoundException e) {
			// The child is gone, or is not in the entry's school: there is no one to name, so nothing is sent.
			skip(id, DeliveryReason.NO_RECIPIENT);
			return false;
		}
		String body = DeliveryEmail.body(event.getType(), child.firstName(), RunDirection.valueOf(event.getDirection()),
				event.getCreatedAt(), clock.getZone(), frontendBaseUrl);
		try {
			mailer.send(parent.getEmail(), DeliveryEmail.SUBJECT, body);
		}
		catch (RuntimeException e) {
			failed(delivery, e);
			return false;
		}
		if (deliveryRepository.markSent(id, Instant.now(clock)) == 0) {
			// The email went out, but a sweep ended the row while the provider was slow: the row is wrong, not the email.
			log.warn("Delivery {} was sent but was no longer SENDING when it finished; it is not marked SENT", id);
		}
		return true;
	}

	private void skip(UUID id, DeliveryReason reason) {
		if (deliveryRepository.end(id, DeliveryStatus.SENDING, DeliveryStatus.SKIPPED, reason) == 0) {
			log.warn("Delivery {} was no longer SENDING when it was skipped ({}); it was changed by another run", id,
					reason);
		}
	}

	private void failed(NotificationDelivery delivery, RuntimeException e) {
		int attempt = delivery.getAttempts();
		String error = e.getClass().getSimpleName();
		if (attempt >= MAX_ATTEMPTS) {
			if (deliveryRepository.end(delivery.getId(), DeliveryStatus.SENDING, DeliveryStatus.FAILED,
					DeliveryReason.PROVIDER_ERROR) == 1) {
				log.warn("Delivery {} of inbox entry {} attempt {} failed ({}); giving up", delivery.getId(),
						delivery.getInboxEventId(), attempt, error);
			}
			else {
				changedMeanwhile(delivery, attempt, error);
			}
			return;
		}
		Instant next = Instant.now(clock).plus(RETRY_DELAYS.get(attempt - 1));
		if (deliveryRepository.retryAt(delivery.getId(), DeliveryReason.PROVIDER_ERROR, next) == 1) {
			log.warn("Delivery {} of inbox entry {} attempt {} failed ({}); retry at {}", delivery.getId(),
					delivery.getInboxEventId(), attempt, error, next);
		}
		else {
			changedMeanwhile(delivery, attempt, error);
		}
	}

	private void changedMeanwhile(NotificationDelivery delivery, int attempt, String error) {
		log.warn("Delivery {} of inbox entry {} attempt {} failed ({}) but the row was no longer SENDING; no retry is planned",
				delivery.getId(), delivery.getInboxEventId(), attempt, error);
	}

	/** One school's deliveries created on this day (school zone), by status and reason. The day defaults to today. */
	public NotificationDeliverySummaryResponse summary(UUID schoolId, LocalDate date) {
		LocalDate day = date != null ? date : LocalDate.now(clock);
		Instant from = day.atStartOfDay(clock.getZone()).toInstant();
		Instant to = day.plusDays(1).atStartOfDay(clock.getZone()).toInstant();
		Map<String, Long> counts = zeroFilled(DeliveryStatus.class, status -> status.name().toLowerCase(Locale.ROOT),
				deliveryRepository.countByStatus(schoolId, from, to));
		Map<String, Long> reasons = zeroFilled(DeliveryReason.class, DeliveryReason::name,
				deliveryRepository.countByReason(schoolId, from, to));
		return new NotificationDeliverySummaryResponse(day, properties.enabled(), properties.dailyCap(), counts, reasons,
				deliveryRepository.countRetried(schoolId, from, to),
				deliveryRepository.oldestPending(schoolId, from, to).orElse(null));
	}

	/** Every value of the enum is a key, 0 when the query found none: the contract says every key is always present. */
	private static <E extends Enum<E>> Map<String, Long> zeroFilled(Class<E> type, Function<E, String> key,
			List<Object[]> rows) {
		Map<String, Long> filled = new LinkedHashMap<>();
		for (E value : type.getEnumConstants()) {
			filled.put(key.apply(value), 0L);
		}
		for (Object[] row : rows) {
			filled.put(key.apply(type.cast(row[0])), (Long) row[1]);
		}
		return filled;
	}
}
