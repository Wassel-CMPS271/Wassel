package com.wassel.backend.auth.service;

import com.wassel.backend.auth.config.LockoutProperties;
import com.wassel.backend.auth.dto.AuthUserResponse;
import com.wassel.backend.auth.dto.LoginRequest;
import com.wassel.backend.auth.exception.InvalidCredentialsException;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;

import java.util.Optional;

@Slf4j
@Service
public class AuthService {

	public record LoginResult(AuthUserResponse user, String token) {
	}

	private final UserService userService;

	private final PasswordEncoder passwordEncoder;

	private final JwtService jwtService;

	private final TwoFactorService twoFactorService;

	private final LockoutProperties lockout;

	private final Clock clock;

	// Checked when the email is unknown or the account locked, so response time doesn't reveal either.
	private final String unknownUserHash;

	public AuthService(UserService userService, PasswordEncoder passwordEncoder, JwtService jwtService,
			TwoFactorService twoFactorService, LockoutProperties lockout, Clock clock) {
		this.userService = userService;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
		this.twoFactorService = twoFactorService;
		this.lockout = lockout;
		this.clock = clock;
		this.unknownUserHash = passwordEncoder.encode("not-a-real-password");
	}

	/**
	 * First step: checks the password and emails the code. Returns the pending token for the second
	 * step, not a session. Unknown email, wrong password, disabled account and locked account all fail
	 * the same way.
	 *
	 * <p>Lockout (SCRUM-171): the attempt is counted before the password is checked, and refused unchecked
	 * while the account is locked or the limit is already counted, so parallel guesses get no more than
	 * the limit between them. The right password clears the count; a wrong one that reaches the limit
	 * locks the account. Each step is its own short statement, so no lock is held during the password check.
	 */
	public String login(LoginRequest request) {
		// An invited account has no password yet: treat it like an unknown email.
		Optional<User> found = userService.findByEmail(request.email()).filter(User::hasPassword);
		boolean mayTry = found
				.map(candidate -> userService.countSignInAttempt(candidate.getId(), lockout.maxFailures(), clock.instant()))
				.orElse(false);
		String hash = mayTry ? found.get().getPasswordHash() : unknownUserHash;
		boolean passwordMatches = passwordEncoder.matches(request.password(), hash);
		if (!mayTry) {
			throw new InvalidCredentialsException();
		}

		User user = found.get();
		if (!passwordMatches) {
			Instant until = clock.instant().plus(lockout.duration());
			if (userService.lockIfTooManyFailures(user.getId(), lockout.maxFailures(), until)) {
				log.warn("Account {} locked until {} after {} wrong passwords in a row", user.getId(), until,
						lockout.maxFailures());
			}
			throw new InvalidCredentialsException();
		}
		userService.clearSignInAttempts(user.getId());
		if (!user.isEnabled()) {
			throw new InvalidCredentialsException();
		}
		return twoFactorService.start(user);
	}

	// Deliberately not @Transactional: an outer transaction would roll back with the exception for a
	// wrong code and undo the attempt count that TwoFactorService.verify keeps.
	public LoginResult completeLogin(String pendingToken, String code) {
		User user = twoFactorService.verify(pendingToken, code);
		return new LoginResult(toResponse(user), jwtService.generateToken(user));
	}

	public AuthUserResponse toResponse(User user) {
		return new AuthUserResponse(user.getId(), user.getEmail(), user.getRole(), user.getSchoolId());
	}
}
