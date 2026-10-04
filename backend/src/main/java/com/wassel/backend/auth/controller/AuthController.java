package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.config.AuthCookie;
import com.wassel.backend.auth.dto.AuthUserResponse;
import com.wassel.backend.auth.dto.LoginRequest;
import com.wassel.backend.auth.service.AuthService;
import com.wassel.backend.auth.service.AuthService.LoginResult;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The token travels only in an HttpOnly cookie, never in a response body. Browsers must send
 * requests with credentials included for the cookie to be stored and sent.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

	private final AuthService authService;

	private final AuthCookie authCookie;

	@PostMapping("/login")
	@PreAuthorize("permitAll()")
	public ResponseEntity<AuthUserResponse> login(@Valid @RequestBody LoginRequest request) {
		LoginResult result = authService.login(request);
		return ResponseEntity.ok()
				.header(HttpHeaders.SET_COOKIE, authCookie.create(result.token()).toString())
				.body(result.user());
	}

	@PostMapping("/logout")
	@PreAuthorize("permitAll()")
	public ResponseEntity<Void> logout() {
		return ResponseEntity.noContent()
				.header(HttpHeaders.SET_COOKIE, authCookie.clear().toString())
				.build();
	}

	@GetMapping("/me")
	@PreAuthorize("isAuthenticated()")
	public AuthUserResponse me(@AuthenticationPrincipal User user) {
		return authService.toResponse(user);
	}
}
