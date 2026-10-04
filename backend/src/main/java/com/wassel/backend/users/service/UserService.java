package com.wassel.backend.users.service;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.exception.UserNotFoundException;
import com.wassel.backend.users.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * For other modules to look up a user within their own school without touching the users
 * module's repository or entity directly (e.g. students, linking a parent to a student).
 */
@Service
@RequiredArgsConstructor
public class UserService {

	private final UserRepository userRepository;

	private final PasswordEncoder passwordEncoder;

	/** The user with the given id, role, and school, or throws if no such user exists. */
	@Transactional(readOnly = true)
	public User getOwnedUser(UUID schoolId, UUID userId, Role role) {
		return userRepository.findBySchoolIdAndIdAndRole(schoolId, userId, role)
				.orElseThrow(() -> new UserNotFoundException(
						"No %s found with that id in this school.".formatted(role.name().toLowerCase())));
	}

	@Transactional(readOnly = true)
	public Optional<User> findByEmail(String email) {
		return userRepository.findByEmailIgnoreCase(email.trim());
	}

	@Transactional(readOnly = true)
	public Optional<User> findById(UUID userId) {
		return userRepository.findById(userId);
	}

	/** The only place accounts are created: emails are stored lowercase, which login relies on. */
	@Transactional
	public User createUser(String email, String rawPassword, Role role, UUID schoolId) {
		User user = User.builder()
				.email(email.trim().toLowerCase(Locale.ROOT))
				.passwordHash(passwordEncoder.encode(rawPassword))
				.role(role)
				.schoolId(schoolId)
				.build();
		return userRepository.save(user);
	}
}
