package com.wassel.backend.auth.repository;

import com.wassel.backend.auth.entity.PasswordToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Not scoped by school: tokens are looked up by their hash or by the user they belong to. */
public interface PasswordTokenRepository extends JpaRepository<PasswordToken, UUID> {

	Optional<PasswordToken> findByTokenHash(String tokenHash);

	Optional<PasswordToken> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

	@Modifying
	@Query("update PasswordToken t set t.usedAt = :now where t.userId = :userId and t.usedAt is null")
	void voidUnusedFor(@Param("userId") UUID userId, @Param("now") Instant now);

	/** Voids the user's unused links other than the one just sent. */
	@Modifying
	@Query("update PasswordToken t set t.usedAt = :now where t.userId = :userId and t.id <> :keepId and t.usedAt is null")
	void voidUnusedExcept(@Param("userId") UUID userId, @Param("keepId") UUID keepId, @Param("now") Instant now);

	/** Returns 0 if the token was already used, so two concurrent requests can't both win. */
	@Modifying
	@Query("update PasswordToken t set t.usedAt = :now where t.id = :id and t.usedAt is null")
	int markUsed(@Param("id") UUID id, @Param("now") Instant now);

	/** The undo of a failed link send: removes the token if nobody has used it. */
	@Modifying
	@Query("delete from PasswordToken t where t.id = :id and t.usedAt is null")
	int deleteUnused(@Param("id") UUID id);
}
