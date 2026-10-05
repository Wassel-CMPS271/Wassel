package com.wassel.backend.auth.service;

import com.wassel.backend.auth.dto.AuthUserResponse;
import com.wassel.backend.auth.dto.LoginRequest;
import com.wassel.backend.auth.exception.InvalidCredentialsException;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class AuthService {

	public record LoginResult(AuthUserResponse user, String token) {
	}

	private final UserService userService;

	private final PasswordEncoder passwordEncoder;

	private final JwtService jwtService;

	// Checked when the email is unknown, so response time doesn't reveal which accounts exist.
	private final String unknownUserHash;

	public AuthService(UserService userService, PasswordEncoder passwordEncoder, JwtService jwtService) {
		this.userService = userService;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
		this.unknownUserHash = passwordEncoder.encode("not-a-real-password");
	}

	/** Unknown email, wrong password and disabled account all fail the same way. */
	public LoginResult login(LoginRequest request) {
		Optional<User> found = userService.findByEmail(request.email());
		// An invited account has no password yet: treat it like an unknown email.
		String hash = found.filter(User::hasPassword).map(User::getPasswordHash).orElse(unknownUserHash);
		boolean passwordMatches = passwordEncoder.matches(request.password(), hash);

		User user = found
				.filter(candidate -> candidate.hasPassword() && passwordMatches && candidate.isEnabled())
				.orElseThrow(InvalidCredentialsException::new);
		return new LoginResult(toResponse(user), jwtService.generateToken(user));
	}

	public AuthUserResponse toResponse(User user) {
		return new AuthUserResponse(user.getId(), user.getEmail(), user.getRole(), user.getSchoolId());
	}
}
