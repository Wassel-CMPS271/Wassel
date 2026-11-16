package com.wassel.backend.inbox.repository;

import com.wassel.backend.inbox.entity.DeliveryReason;
import com.wassel.backend.inbox.entity.DeliveryStatus;
import com.wassel.backend.inbox.entity.NotificationDelivery;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every change is one conditional statement in its own short transaction, so the sender holds no transaction while it
 * calls the mail provider, and two senders cannot both win a delivery (the {@code claim} is the {@code LoginCode} pattern).
 * Writes clear the persistence context, so a re-read is not a stale entity.
 */
public interface NotificationDeliveryRepository extends JpaRepository<NotificationDelivery, UUID> {

	/**
	 * Makes a delivery for every entry made after {@code since} that has none. The unique key is what keeps it at one.
	 * A delivery is due from its entry's own time (never later than {@code now}), so the oldest entries are sent first.
	 */
	@Transactional
	@Modifying(clearAutomatically = true)
	@Query(value = """
			INSERT INTO notification_deliveries (id, school_id, inbox_event_id, status, attempts, next_attempt_at, created_at)
			SELECT gen_random_uuid(), e.school_id, e.id, 'PENDING', 0, LEAST(e.created_at, :now), :now
			FROM inbox_events e WHERE e.created_at > :since
			ON CONFLICT (inbox_event_id) DO NOTHING
			""", nativeQuery = true)
	int discover(@Param("since") Instant since, @Param("now") Instant now);

	/** Ends the deliveries still waiting whose entry is as old as {@code cutoff} or older. */
	@Transactional
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE notification_deliveries d SET status = 'FAILED', reason = 'EXPIRED'
			WHERE d.status = 'PENDING'
			AND EXISTS (SELECT 1 FROM inbox_events e WHERE e.id = d.inbox_event_id AND e.created_at <= :cutoff)
			""", nativeQuery = true)
	int expire(@Param("cutoff") Instant cutoff);

	/** Ends the sends that started before {@code staleBefore} and never finished: never sent again. */
	@Transactional
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE notification_deliveries SET status = 'FAILED', reason = 'INTERRUPTED'
			WHERE status = 'SENDING' AND claimed_at < :staleBefore
			""", nativeQuery = true)
	int interrupt(@Param("staleBefore") Instant staleBefore);

	@Query(value = """
			SELECT id FROM notification_deliveries WHERE status = 'PENDING' AND next_attempt_at <= :now
			ORDER BY next_attempt_at, id LIMIT :limit
			""", nativeQuery = true)
	List<UUID> findDueIds(@Param("now") Instant now, @Param("limit") int limit);

	/** Takes the delivery for one attempt and counts it. Answers 1 for the one caller that got it, 0 for any other. */
	@Transactional
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE notification_deliveries SET status = 'SENDING', attempts = attempts + 1, claimed_at = :now
			WHERE id = :id AND status = 'PENDING' AND next_attempt_at <= :now
			""", nativeQuery = true)
	int claim(@Param("id") UUID id, @Param("now") Instant now);

	/** The send went out. Clears the reason a failed earlier attempt left. */
	@Transactional
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE notification_deliveries SET status = 'SENT', sent_at = :now, reason = NULL WHERE id = :id AND status = 'SENDING'
			""", nativeQuery = true)
	int markSent(@Param("id") UUID id, @Param("now") Instant now);

	/** A failed attempt with attempts left: due again at {@code next}. */
	@Transactional
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE notification_deliveries SET status = 'PENDING', reason = :#{#reason.name()}, next_attempt_at = :next
			WHERE id = :id AND status = 'SENDING'
			""", nativeQuery = true)
	int retryAt(@Param("id") UUID id, @Param("reason") DeliveryReason reason, @Param("next") Instant next);

	/** Final: {@code FAILED} or {@code SKIPPED}, from the state the caller holds the delivery in. */
	@Transactional
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE notification_deliveries SET status = :#{#to.name()}, reason = :#{#reason.name()}
			WHERE id = :id AND status = :#{#from.name()}
			""", nativeQuery = true)
	int end(@Param("id") UUID id, @Param("from") DeliveryStatus from, @Param("to") DeliveryStatus to,
			@Param("reason") DeliveryReason reason);

	/**
	 * The attempts made since {@code start}, for the cap: every attempt that reached, or may have reached, the provider,
	 * so a retry counts again and a failed delivery still counts what it used. Skipped deliveries are not counted (they
	 * are skipped before anything is sent), and an attempt in flight is.
	 */
	@Query(value = """
			SELECT COALESCE(SUM(attempts), 0) FROM notification_deliveries
			WHERE status <> 'SKIPPED' AND claimed_at >= :start
			""", nativeQuery = true)
	long countAttemptsSince(@Param("start") Instant start);

	/** Held until the surrounding transaction ends: the cap check and the claim are one step at a time across instances. */
	@Query(value = "SELECT 1 FROM (SELECT pg_advisory_xact_lock(:key)) AS locked", nativeQuery = true)
	int lockForCap(@Param("key") long key);

	@Query("""
			SELECT d.status, COUNT(d) FROM NotificationDelivery d
			WHERE d.schoolId = :schoolId AND d.createdAt >= :from AND d.createdAt < :to GROUP BY d.status
			""")
	List<Object[]> countByStatus(@Param("schoolId") UUID schoolId, @Param("from") Instant from, @Param("to") Instant to);

	@Query("""
			SELECT d.reason, COUNT(d) FROM NotificationDelivery d
			WHERE d.schoolId = :schoolId AND d.createdAt >= :from AND d.createdAt < :to
			AND d.status IN (com.wassel.backend.inbox.entity.DeliveryStatus.FAILED,
				com.wassel.backend.inbox.entity.DeliveryStatus.SKIPPED)
			AND d.reason IS NOT NULL GROUP BY d.reason
			""")
	List<Object[]> countByReason(@Param("schoolId") UUID schoolId, @Param("from") Instant from, @Param("to") Instant to);

	@Query("""
			SELECT COUNT(d) FROM NotificationDelivery d
			WHERE d.schoolId = :schoolId AND d.createdAt >= :from AND d.createdAt < :to AND d.attempts > 1
			""")
	long countRetried(@Param("schoolId") UUID schoolId, @Param("from") Instant from, @Param("to") Instant to);

	@Query("""
			SELECT MIN(d.createdAt) FROM NotificationDelivery d
			WHERE d.schoolId = :schoolId AND d.createdAt >= :from AND d.createdAt < :to
			AND d.status = com.wassel.backend.inbox.entity.DeliveryStatus.PENDING
			""")
	Optional<Instant> oldestPending(@Param("schoolId") UUID schoolId, @Param("from") Instant from,
			@Param("to") Instant to);
}
