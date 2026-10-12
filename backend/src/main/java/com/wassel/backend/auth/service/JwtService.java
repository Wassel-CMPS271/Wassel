package com.wassel.backend.auth.service;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.wassel.backend.auth.config.JwtProperties;
import com.wassel.backend.users.entity.User;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class JwtService {

	private final JwtProperties jwtProperties;

	private final JwtEncoder encoder;

	private final JwtDecoder decoder;

	public JwtService(JwtProperties jwtProperties) {
		this.jwtProperties = jwtProperties;
		SecretKey key = new SecretKeySpec(jwtProperties.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
		this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
		this.decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
	}

	public String generateToken(User user) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.subject(user.getId().toString())
				.issuedAt(now)
				.expiresAt(now.plus(jwtProperties.expiration()))
				.build();
		return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
				.getTokenValue();
	}

	/** Empty for any malformed, tampered, wrong-key or expired token. */
	public Optional<UUID> parseUserId(String token) {
		try {
			return Optional.of(UUID.fromString(decoder.decode(token).getSubject()));
		} catch (JwtException | IllegalArgumentException e) {
			return Optional.empty();
		}
	}
}
