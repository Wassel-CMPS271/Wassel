package com.wassel.backend.inbox.repository;

import com.wassel.backend.inbox.entity.NotificationPreference;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Every read is scoped by school and parent, so a parent can only ever reach their own choices. */
public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, UUID> {

	Optional<NotificationPreference> findBySchoolIdAndParentUserId(UUID schoolId, UUID parentUserId);

	/**
	 * Makes the parent's row or replaces it, in one statement: two saves at once both succeed and the later one wins,
	 * and a first save racing another cannot fail on the key (catching that violation would poison the surrounding
	 * PostgreSQL transaction). The row's school is its parent's own and never changes.
	 */
	@Modifying(clearAutomatically = true)
	@Query(value = """
			INSERT INTO notification_preferences (parent_user_id, school_id, picked_up, dropped_off, not_present, late,
				late_after_minutes, updated_at)
			VALUES (:parentUserId, :schoolId, :pickedUp, :droppedOff, :notPresent, :late, :lateAfterMinutes, :now)
			ON CONFLICT (parent_user_id) DO UPDATE SET picked_up = EXCLUDED.picked_up,
				dropped_off = EXCLUDED.dropped_off, not_present = EXCLUDED.not_present, late = EXCLUDED.late,
				late_after_minutes = EXCLUDED.late_after_minutes, updated_at = EXCLUDED.updated_at
			""", nativeQuery = true)
	int upsert(@Param("schoolId") UUID schoolId, @Param("parentUserId") UUID parentUserId,
			@Param("pickedUp") boolean pickedUp, @Param("droppedOff") boolean droppedOff,
			@Param("notPresent") boolean notPresent, @Param("late") boolean late,
			@Param("lateAfterMinutes") int lateAfterMinutes, @Param("now") Instant now);
}
