package com.wassel.backend.inbox.repository;

import com.wassel.backend.inbox.entity.InboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every statement is scoped by school and parent, so a parent can only ever reach their own entries. Writes are
 * single statements and clear the persistence context, so a re-read is not a stale entity.
 */
public interface InboxEventRepository extends JpaRepository<InboxEvent, UUID> {

	/** The newest 50 entries, newest first (the id breaks a tie of equal times, so the order is stable). */
	List<InboxEvent> findTop50BySchoolIdAndParentUserIdOrderByCreatedAtDescIdDesc(UUID schoolId, UUID parentUserId);

	/** The newest 50 unread entries, newest first. */
	List<InboxEvent> findTop50BySchoolIdAndParentUserIdAndReadAtIsNullOrderByCreatedAtDescIdDesc(UUID schoolId,
			UUID parentUserId);

	long countBySchoolIdAndParentUserIdAndReadAtIsNull(UUID schoolId, UUID parentUserId);

	Optional<InboxEvent> findBySchoolIdAndParentUserIdAndId(UUID schoolId, UUID parentUserId, UUID id);

	/**
	 * Makes the entry unless this event already has one. One statement, so a repeat or a retry creates nothing
	 * (catching the unique-key violation instead would poison the surrounding PostgreSQL transaction).
	 */
	@Modifying(clearAutomatically = true)
	@Query(value = """
			INSERT INTO inbox_events (id, school_id, parent_user_id, student_id, student_name, run_id, direction, type,
				created_at)
			VALUES (gen_random_uuid(), :schoolId, :parentUserId, :studentId, :studentName, :runId, :direction, :type,
				:now)
			ON CONFLICT (run_id, student_id, type) DO NOTHING
			""", nativeQuery = true)
	int insertIfMissing(@Param("schoolId") UUID schoolId, @Param("parentUserId") UUID parentUserId,
			@Param("studentId") UUID studentId, @Param("studentName") String studentName,
			@Param("runId") UUID runId, @Param("direction") String direction, @Param("type") String type,
			@Param("now") Instant now);

	/** Marks one entry read; an entry already read keeps its first time. Returns how many it changed. */
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE inbox_events SET read_at = :now
			WHERE id = :id AND school_id = :schoolId AND parent_user_id = :parentUserId AND read_at IS NULL
			""", nativeQuery = true)
	int markRead(@Param("schoolId") UUID schoolId, @Param("parentUserId") UUID parentUserId, @Param("id") UUID id,
			@Param("now") Instant now);

	/** Marks every unread entry of the parent read. */
	@Modifying(clearAutomatically = true)
	@Query(value = """
			UPDATE inbox_events SET read_at = :now
			WHERE school_id = :schoolId AND parent_user_id = :parentUserId AND read_at IS NULL
			""", nativeQuery = true)
	int markAllRead(@Param("schoolId") UUID schoolId, @Param("parentUserId") UUID parentUserId,
			@Param("now") Instant now);
}
