package com.wassel.backend.auth.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Works out which address a request really came from, for {@link RateLimitFilter}.
 * <p>
 * With no trusted proxy ({@code trustedProxyHops} 0) it is the connection's own address and
 * {@code X-Forwarded-For} is ignored, so a forged header from outside can never pick the bucket. Behind N
 * proxies that each append the address they were called from, the real client is the Nth entry counted from the
 * <em>right</em>: everything to its left was written by the client or by earlier hops and is not trusted. A
 * header with fewer entries than that means the request did not come through the proxies the way it was
 * configured, so the connection's own address is used instead.
 * <p>
 * An IPv6 address is reduced to its /64, because one machine can use billions of addresses inside it and would
 * otherwise get a fresh bucket for each. An IPv4-mapped IPv6 address counts as the IPv4 one.
 */
@Component
public class ClientAddressResolver {

	private static final Pattern IPV4 = Pattern.compile("\\d{1,3}(\\.\\d{1,3}){3}");

	private static final Pattern IPV6 = Pattern.compile("[0-9a-fA-F:.]{2,45}");

	private final int trustedProxyHops;

	public ClientAddressResolver(RateLimitProperties properties) {
		this.trustedProxyHops = properties.trustedProxyHops();
	}

	public String resolve(HttpServletRequest request) {
		String remote = normalize(request.getRemoteAddr());
		if (remote == null) {
			remote = String.valueOf(request.getRemoteAddr());
		}
		if (trustedProxyHops == 0) {
			return remote;
		}
		List<String> chain = forwardedChain(request);
		if (chain.size() < trustedProxyHops) {
			return remote;
		}
		String forwarded = normalize(chain.get(chain.size() - trustedProxyHops));
		return forwarded != null ? forwarded : remote;
	}

	/** Every {@code X-Forwarded-For} header, in order, as one list of entries. */
	public static List<String> forwardedChain(HttpServletRequest request) {
		List<String> chain = new ArrayList<>();
		for (String header : Collections.list(request.getHeaders("X-Forwarded-For"))) {
			for (String part : header.split(",")) {
				chain.add(part.trim());
			}
		}
		return chain;
	}

	/** The bucket key for an address, or null when it is not an IP address literal (no name is ever looked up). */
	static String normalize(String candidate) {
		if (candidate == null) {
			return null;
		}
		boolean v4 = IPV4.matcher(candidate).matches();
		boolean v6 = candidate.indexOf(':') >= 0 && IPV6.matcher(candidate).matches();
		if (!v4 && !v6) {
			return null;
		}
		try {
			InetAddress address = InetAddress.getByName(candidate);
			if (address instanceof Inet4Address) {
				return address.getHostAddress();
			}
			if (address instanceof Inet6Address) {
				byte[] bytes = address.getAddress();
				StringBuilder prefix = new StringBuilder("v6:");
				for (int i = 0; i < 8; i++) {
					prefix.append(String.format("%02x", bytes[i]));
				}
				return prefix.toString();
			}
		} catch (UnknownHostException e) {
			return null;
		}
		return null;
	}
}
