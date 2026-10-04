package com.wassel.backend.users.repository;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Every query is scoped by school id, except the login-time lookups (by email, and the inherited
 * {@code findById}), which run before the caller's school is known.
 */
public interface UserRepository extends JpaRepository<User, UUID> {

	Optional<User> findBySchoolIdAndIdAndRole(UUID schoolId, UUID id, Role role);

	Optional<User> findByEmailIgnoreCase(String email);
}
