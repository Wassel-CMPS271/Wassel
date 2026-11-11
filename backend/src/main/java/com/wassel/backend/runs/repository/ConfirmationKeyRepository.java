package com.wassel.backend.runs.repository;

import com.wassel.backend.runs.entity.ConfirmationKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Every read is scoped by school id, so callers can't cross the tenant boundary. */
public interface ConfirmationKeyRepository extends JpaRepository<ConfirmationKey, UUID> {

	Optional<ConfirmationKey> findBySchoolIdAndDriverUserIdAndClientRequestId(UUID schoolId, UUID driverUserId,
			UUID clientRequestId);

	/**
	 * Saves the driver's key, or leaves the one that is there, and returns how many rows it added. One statement,
	 * because catching the unique-key violation would poison the surrounding PostgreSQL transaction.
	 */
	@Modifying
	@Query(value = """
			INSERT INTO confirmation_keys (id, school_id, driver_user_id, client_request_id, run_id, student_id, status, created_at)
			VALUES (gen_random_uuid(), :schoolId, :driverUserId, :clientRequestId, :runId, :studentId, :status, :now)
			ON CONFLICT (driver_user_id, client_request_id) DO NOTHING
			""", nativeQuery = true)
	int insertIfMissing(@Param("schoolId") UUID schoolId, @Param("driverUserId") UUID driverUserId,
			@Param("clientRequestId") UUID clientRequestId, @Param("runId") UUID runId,
			@Param("studentId") UUID studentId, @Param("status") String status, @Param("now") Instant now);
}
