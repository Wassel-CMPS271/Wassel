package com.wassel.backend.config;

import com.wassel.backend.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Issues and verifies JWT access tokens.
 *
 * <p>Stub only — the real implementation lands in SCRUM-168. Every method fails
 * closed by throwing until then.
 */
@Service
@RequiredArgsConstructor
public class JwtService {

	private final JwtProperties jwtProperties;

	/**
	 * Creates a signed access token for the given user.
	 */
	public String generateToken(User user) {
		// TODO (SCRUM-168): pick a JWT library (e.g. jjwt / nimbus-jose-jwt) and build a
		//  token signed with jwtProperties.secret(), expiring after jwtProperties.expiration().
		//  Claims should include at least: sub = user id, role, schoolId (tenant isolation).
		throw new UnsupportedOperationException("JWT generation not implemented yet (SCRUM-168)");
	}

	/**
	 * Returns true if the token has a valid signature, is not expired, and belongs to the given user.
	 */
	public boolean validateToken(String token, User user) {
		// TODO (SCRUM-168): verify signature and expiry, check the subject matches the user,
		//  and reject tokens for users whose account is disabled/suspended.
		throw new UnsupportedOperationException("JWT validation not implemented yet (SCRUM-168)");
	}

	/**
	 * Parses the token and returns its claims.
	 */
	public Map<String, Object> extractClaims(String token) {
		// TODO (SCRUM-168): parse and verify the token, then return its claims.
		//  Consider returning a typed claims object instead of a raw map.
		throw new UnsupportedOperationException("JWT claim extraction not implemented yet (SCRUM-168)");
	}
}
