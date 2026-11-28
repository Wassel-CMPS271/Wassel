package com.wassel.backend.auth.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** SCRUM-288: which address the limiter counts a request against, and that a forged header cannot pick it. */
class ClientAddressResolverTests {

	private static ClientAddressResolver resolver(int hops) {
		return new ClientAddressResolver(new RateLimitProperties(true, Duration.ofMinutes(1), hops,
				new RateLimitProperties.Limits(1, 1, 1, 1, 1, 1)));
	}

	private static MockHttpServletRequest request(String remote, String... forwardedHeaders) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr(remote);
		for (String header : forwardedHeaders) {
			request.addHeader("X-Forwarded-For", header);
		}
		return request;
	}

	@Test
	void withNoTrustedProxyTheForwardedHeaderIsIgnored() {
		// A client outside any proxy writes whatever it likes: it must never choose its own bucket.
		assertEquals("203.0.113.9", resolver(0).resolve(request("203.0.113.9", "10.1.1.1, 10.2.2.2")));
	}

	@Test
	void behindOneProxyTheLastEntryIsTheClientAndEarlierOnesAreForged() {
		// The client wrote "1.1.1.1" itself; the proxy appended the address it really saw.
		assertEquals("198.51.100.7", resolver(1).resolve(request("10.0.0.1", "1.1.1.1, 198.51.100.7")));
	}

	@Test
	void behindTwoProxiesTheEntryTwoFromTheRightIsTheClient() {
		assertEquals("198.51.100.7",
				resolver(2).resolve(request("10.0.0.1", "6.6.6.6, 198.51.100.7, 192.0.2.50")));
	}

	@Test
	void severalHeaderLinesAreOneChain() {
		assertEquals("198.51.100.7",
				resolver(2).resolve(request("10.0.0.1", "6.6.6.6, 198.51.100.7", "192.0.2.50")));
	}

	@Test
	void aShorterChainThanTheProxiesWouldWriteFallsBackToTheConnection() {
		// Two proxies would have written two entries, so this request did not come through them as configured.
		assertEquals("203.0.113.9", resolver(2).resolve(request("203.0.113.9", "1.1.1.1")));
		assertEquals("203.0.113.9", resolver(1).resolve(request("203.0.113.9")));
	}

	@Test
	void anEntryThatIsNotAnAddressFallsBackToTheConnectionAndIsNeverLookedUp() {
		assertEquals("203.0.113.9", resolver(1).resolve(request("203.0.113.9", "1.1.1.1, example.com")));
		assertEquals("203.0.113.9", resolver(1).resolve(request("203.0.113.9", "1.1.1.1, abcdef")));
		assertEquals("203.0.113.9", resolver(1).resolve(request("203.0.113.9", "1.1.1.1, 999.1.1.1")));
		assertEquals("203.0.113.9", resolver(1).resolve(request("203.0.113.9", "1.1.1.1, ")));
	}

	@Test
	void anIpv6AddressCountsAsItsSixtyFourBitPrefix() {
		String first = resolver(0).resolve(request("2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
		String sameNetwork = resolver(0).resolve(request("2001:db8:1:2:1:2:3:4"));
		String otherNetwork = resolver(0).resolve(request("2001:db8:1:3:1:2:3:4"));
		assertEquals(first, sameNetwork);
		assertNotEquals(first, otherNetwork);
	}

	@Test
	void anIpv4MappedIpv6AddressCountsAsTheIpv4One() {
		assertEquals("203.0.113.9", resolver(0).resolve(request("::ffff:203.0.113.9")));
		assertEquals("198.51.100.7", resolver(1).resolve(request("10.0.0.1", "1.1.1.1, ::ffff:198.51.100.7")));
	}

	@Test
	void normalizeRejectsWhatIsNotAnAddress() {
		assertNull(ClientAddressResolver.normalize(null));
		assertNull(ClientAddressResolver.normalize(""));
		assertNull(ClientAddressResolver.normalize("localhost"));
		assertNull(ClientAddressResolver.normalize("1.2.3"));
		assertNull(ClientAddressResolver.normalize("1.2.3.4:80"));
		assertNull(ClientAddressResolver.normalize(":::"));
	}
}
