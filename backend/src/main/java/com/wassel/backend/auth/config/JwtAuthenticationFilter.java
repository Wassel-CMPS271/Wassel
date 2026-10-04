package com.wassel.backend.auth.config;

import com.wassel.backend.auth.service.JwtService;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.service.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * The user is reloaded on every request, so a disabled account or a role change applies at once.
 * A bad token just leaves the request anonymous (401 on protected routes), so a stale cookie
 * can never block signing in again.
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;

	private final UserService userService;

	private final AuthCookie authCookie;

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		authCookie.read(request)
				.flatMap(jwtService::parseUserId)
				.flatMap(userService::findById)
				.filter(User::isEnabled)
				.ifPresent(this::authenticate);
		filterChain.doFilter(request, response);
	}

	private void authenticate(User user) {
		SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
				user, null, List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))));
	}
}
