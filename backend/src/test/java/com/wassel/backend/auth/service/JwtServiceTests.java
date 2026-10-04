package com.wassel.backend.auth.service;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.wassel.backend.auth.config.JwtProperties;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceTests {

	private static final String SECRET = "test-secret-test-secret-test-secret-test-secret";

	private final JwtService jwtService = new JwtService(new JwtProperties(SECRET, Duration.ofHours(1), false));

	private final User user = User.builder().id(UUID.randomUUID()).email("a@wassel.test").passwordHash("x")
			.role(Role.PARENT).schoolId(UUID.randomUUID()).build();

	private static String signed(String secret, String subject, Instant issuedAt, Instant expiresAt) {
		NimbusJwtEncoder encoder = new NimbusJwtEncoder(new ImmutableSecret<>(
				new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")));
		JwtClaimsSet claims = JwtClaimsSet.builder().subject(subject).issuedAt(issuedAt).expiresAt(expiresAt).build();
		return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
				.getTokenValue();
	}

	@Test
	void aTokenRoundTripsToTheUserItWasIssuedTo() {
		assertEquals(user.getId(), jwtService.parseUserId(jwtService.generateToken(user)).orElseThrow());
	}

	@Test
	void aTokenExpiresAfterTheConfiguredLifetime() {
		Jwt jwt = NimbusJwtDecoder.withSecretKey(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
				.build().decode(jwtService.generateToken(user));

		assertTrue(Duration.between(Instant.now(), jwt.getExpiresAt()).toMinutes() >= 59);
	}

	@Test
	void garbageIsRejectedWithoutThrowing() {
		assertTrue(jwtService.parseUserId("").isEmpty());
		assertTrue(jwtService.parseUserId("not-a-jwt").isEmpty());
		assertTrue(jwtService.parseUserId("a.b.c").isEmpty());
	}

	@Test
	void aTokenSignedWithAnotherKeyIsRejected() {
		String forged = signed("another-secret-another-secret-another-secret", user.getId().toString(),
				Instant.now(), Instant.now().plusSeconds(3600));

		assertTrue(jwtService.parseUserId(forged).isEmpty());
	}

	@Test
	void anExpiredTokenIsRejected() {
		String expired = signed(SECRET, user.getId().toString(), Instant.now().minusSeconds(7200),
				Instant.now().minusSeconds(3600));

		assertTrue(jwtService.parseUserId(expired).isEmpty());
	}

	@Test
	void anUnsignedTokenIsRejected() {
		Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
		String none = encoder.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8)) + "."
				+ encoder.encodeToString(("{\"sub\":\"" + user.getId() + "\"}").getBytes(StandardCharsets.UTF_8)) + ".";

		assertTrue(jwtService.parseUserId(none).isEmpty());
	}

	@Test
	void aSubjectThatIsNotAUserIdIsRejected() {
		String token = signed(SECRET, "not-a-uuid", Instant.now(), Instant.now().plusSeconds(3600));

		assertTrue(jwtService.parseUserId(token).isEmpty());
	}
}
