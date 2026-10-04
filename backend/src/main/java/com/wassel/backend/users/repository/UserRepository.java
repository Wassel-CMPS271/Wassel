package com.wassel.backend.users.repository;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Every query is scoped by school id, so callers can't read across the tenant boundary.
 */
public interface UserRepository extends JpaRepository<User, UUID> {

	Optional<User> findBySchoolIdAndIdAndRole(UUID schoolId, UUID id, Role role);
}
