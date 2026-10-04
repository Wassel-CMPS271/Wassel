package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.config.AuthCookie;
import com.wassel.backend.auth.dto.AuthUserResponse;
import com.wassel.backend.auth.dto.ForgotPasswordRequest;
import com.wassel.backend.auth.dto.LoginRequest;
import com.wassel.backend.auth.dto.SetPasswordRequest;
import com.wassel.backend.auth.dto.VerifyCodeRequest;
import com.wassel.backend.auth.service.AuthService;
import com.wassel.backend.auth.service.AuthService.LoginResult;
import com.wassel.backend.auth.service.PasswordService;
import com.wassel.backend.users.entity.User;
import jakarta.servlet.http.HttpServletRequest;
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

	private final PasswordService passwordService;

	private final AuthCookie authCookie;

	/** Step one of two: no session yet. The emailed code is exchanged for the session by {@link #verify}. */
	@PostMapping("/login")
	@PreAuthorize("permitAll()")
	public ResponseEntity<Void> login(@Valid @RequestBody LoginRequest request) {
		String pendingToken = authService.login(request);
		return ResponseEntity.noContent()
				.header(HttpHeaders.SET_COOKIE, authCookie.createPending(pendingToken).toString())
				.build();
	}

	@PostMapping("/2fa/verify")
	@PreAuthorize("permitAll()")
	public ResponseEntity<AuthUserResponse> verify(@Valid @RequestBody VerifyCodeRequest request,
			HttpServletRequest http) {
		LoginResult result = authService.completeLogin(authCookie.readPending(http).orElse(null), request.code());
		return ResponseEntity.ok()
				.header(HttpHeaders.SET_COOKIE, authCookie.create(result.token()).toString())
				.header(HttpHeaders.SET_COOKIE, authCookie.clearPending().toString())
				.body(result.user());
	}

	@PostMapping("/2fa/resend")
	@PreAuthorize("permitAll()")
	public ResponseEntity<Void> resend(HttpServletRequest http) {
		authService.resendCode(authCookie.readPending(http).orElse(null));
		return ResponseEntity.noContent().build();
	}

	@PostMapping("/logout")
	@PreAuthorize("permitAll()")
	public ResponseEntity<Void> logout() {
		return ResponseEntity.noContent()
				.header(HttpHeaders.SET_COOKIE, authCookie.clear().toString())
				.build();
	}

	@PostMapping("/forgot-password")
	@PreAuthorize("permitAll()")
	public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
		passwordService.forgotPassword(request.email());
		return ResponseEntity.noContent().build();
	}

	/** Both the first-time set (invite link) and the reset (forgot-password link) end here. */
	@PostMapping("/password")
	@PreAuthorize("permitAll()")
	public ResponseEntity<Void> setPassword(@Valid @RequestBody SetPasswordRequest request) {
		passwordService.setPassword(request.token(), request.password());
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/me")
	@PreAuthorize("isAuthenticated()")
	public AuthUserResponse me(@AuthenticationPrincipal User user) {
		return authService.toResponse(user);
	}
}
