package com.wassel.backend.auth.repository;

import com.wassel.backend.auth.entity.AuthEmail;
import com.wassel.backend.auth.entity.AuthEmailKind;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.UUID;

public interface AuthEmailRepository extends JpaRepository<AuthEmail, UUID> {

	long countByCreatedAtGreaterThanEqual(Instant start);

	long countByKindAndCreatedAtGreaterThanEqual(AuthEmailKind kind, Instant start);

	long countByUserIdAndKindInAndCreatedAtGreaterThanEqual(UUID userId, Collection<AuthEmailKind> kinds, Instant start);

	/** Held until the surrounding transaction ends: the cap check and the claim are one step at a time across instances. */
	@Query(value = "SELECT 1 FROM (SELECT pg_advisory_xact_lock(:key)) AS locked", nativeQuery = true)
	int lockForCap(@Param("key") long key);
}
