package com.wassel.backend.users.repository;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every query is scoped by school id, except the login-time lookups (by email, and the inherited
 * {@code findById}), which run before the caller's school is known.
 */
public interface UserRepository extends JpaRepository<User, UUID> {

	Optional<User> findBySchoolIdAndId(UUID schoolId, UUID id);

	Optional<User> findBySchoolIdAndIdAndRole(UUID schoolId, UUID id, Role role);

	List<User> findBySchoolIdAndRoleOrderByCreatedAtAsc(UUID schoolId, Role role);

	Optional<User> findByEmailIgnoreCase(String email);

	/** Emails are stored lowercase, so callers pass lowercase emails. */
	boolean existsByEmailNotIn(Collection<String> emails);

	/**
	 * Counts a sign-in attempt before its password is checked (SCRUM-171), in one statement: 1 when the account is
	 * not locked and has fewer than {@code max} attempts counted, 0 otherwise. Counting first is what keeps parallel
	 * guesses to {@code max}: each must win a slot here before it may try its password.
	 */
	@Modifying
	@Query("UPDATE User u SET u.failedSignIns = u.failedSignIns + 1 WHERE u.id = :id "
			+ "AND (u.lockedUntil IS NULL OR u.lockedUntil <= :now) AND u.failedSignIns < :max")
	int countSignInAttempt(@Param("id") UUID id, @Param("max") int max, @Param("now") Instant now);

	/** The right password: the attempts counted so far are not failures in a row any more. */
	@Modifying
	@Query("UPDATE User u SET u.failedSignIns = 0 WHERE u.id = :id AND u.failedSignIns > 0")
	int clearSignInAttempts(@Param("id") UUID id);

	/**
	 * A wrong password: locks the account until {@code until} and starts the count over if {@code max} failures are
	 * counted. 1 for the request that locked it; 0 otherwise, so parallel failures write one lock.
	 */
	@Modifying
	@Query("UPDATE User u SET u.lockedUntil = :until, u.failedSignIns = 0 WHERE u.id = :id AND u.failedSignIns >= :max")
	int lockIfTooManyFailures(@Param("id") UUID id, @Param("max") int max, @Param("until") Instant until);
}
