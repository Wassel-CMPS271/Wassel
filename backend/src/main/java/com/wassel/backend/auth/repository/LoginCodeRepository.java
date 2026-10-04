package com.wassel.backend.auth.repository;

import com.wassel.backend.auth.entity.LoginCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Not scoped by school: rows are looked up by the pending token's hash or by the user they belong to. */
public interface LoginCodeRepository extends JpaRepository<LoginCode, UUID> {

	Optional<LoginCode> findByPendingHash(String pendingHash);

	Optional<LoginCode> findByUserId(UUID userId);

	// An explicit query, not a derived delete: a derived one would be flushed after the replacement
	// row's insert and trip the unique user_id.
	@Modifying
	@Query("delete from LoginCode c where c.userId = :userId")
	void deleteForUser(@Param("userId") UUID userId);

	/** Returns 0 once the code is used or has had its attempts, so parallel guesses can't exceed the limit. */
	@Modifying
	@Query("update LoginCode c set c.attempts = c.attempts + 1 "
			+ "where c.id = :id and c.usedAt is null and c.attempts < :max")
	int recordAttempt(@Param("id") UUID id, @Param("max") int max);

	/**
	 * Swaps in a fresh code and fresh attempts, but only for an open pending login whose last code was
	 * sent at or before {@code cutoff}. Returns 0 otherwise, so parallel resends can't all get through.
	 */
	@Modifying
	@Query("update LoginCode c set c.codeHash = :codeHash, c.expiresAt = :expiresAt, c.sentAt = :now, c.attempts = 0 "
			+ "where c.id = :id and c.usedAt is null and c.attempts < :max and c.sentAt <= :cutoff")
	int reissue(@Param("id") UUID id, @Param("codeHash") String codeHash, @Param("expiresAt") Instant expiresAt,
			@Param("now") Instant now, @Param("cutoff") Instant cutoff, @Param("max") int max);

	/** Returns 0 if the code was already used, so two requests can't both win. */
	@Modifying
	@Query("update LoginCode c set c.usedAt = :now where c.id = :id and c.usedAt is null")
	int markUsed(@Param("id") UUID id, @Param("now") Instant now);
}
