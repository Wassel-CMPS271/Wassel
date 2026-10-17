package com.wassel.backend.geocoding.service;

import com.wassel.backend.geocoding.config.NominatimProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.GET;

class NominatimGeocoderTests {

	private static final NominatimProperties PROPERTIES =
			new NominatimProperties("https://nominatim.test", "wassel-test-agent/1.0", null, null);

	private RestClient.Builder builder = RestClient.builder();

	private MockRestServiceServer mockServer() {
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		return server;
	}

	@Test
	void aSuccessfulLookupReturnsTheCoordinates() {
		MockRestServiceServer server = mockServer();
		server.expect(requestTo("https://nominatim.test/search?q=Hamra%20Street&format=json&limit=1"))
				.andExpect(method(GET))
				.andRespond(withSuccess(
						"[{\"lat\":\"33.8938\",\"lon\":\"35.5018\",\"display_name\":\"Hamra\"}]", MediaType.APPLICATION_JSON));
		Geocoder geocoder = new NominatimGeocoder(builder, PROPERTIES);

		Optional<GeocodeResult> result = geocoder.geocode("Hamra Street");

		assertEquals(Optional.of(new GeocodeResult(new BigDecimal("33.8938"), new BigDecimal("35.5018"))), result);
		server.verify();
	}

	@Test
	void anEmptyResultIsNotFound() {
		MockRestServiceServer server = mockServer();
		server.expect(requestTo("https://nominatim.test/search?q=Nowhere&format=json&limit=1"))
				.andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
		Geocoder geocoder = new NominatimGeocoder(builder, PROPERTIES);

		assertTrue(geocoder.geocode("Nowhere").isEmpty());
		server.verify();
	}

	@Test
	void aProviderErrorIsTreatedAsNotFoundNotAnException() {
		MockRestServiceServer server = mockServer();
		server.expect(requestTo("https://nominatim.test/search?q=Hamra&format=json&limit=1"))
				.andRespond(withServerError());
		Geocoder geocoder = new NominatimGeocoder(builder, PROPERTIES);

		assertTrue(geocoder.geocode("Hamra").isEmpty());
		server.verify();
	}

	@Test
	void theSameAddressIsNeverRequestedTwice() {
		MockRestServiceServer server = mockServer();
		// Registered once: a second real request for the same address would leave this
		// expectation already consumed and fail verify() below.
		server.expect(requestTo("https://nominatim.test/search?q=Hamra&format=json&limit=1"))
				.andRespond(withSuccess("[{\"lat\":\"1\",\"lon\":\"2\"}]", MediaType.APPLICATION_JSON));
		Geocoder geocoder = new NominatimGeocoder(builder, PROPERTIES);

		Optional<GeocodeResult> first = geocoder.geocode("Hamra");
		Optional<GeocodeResult> second = geocoder.geocode("Hamra");

		assertEquals(first, second);
		server.verify();
	}

	@Test
	void requestsToDifferentAddressesAreThrottledToOnePerSecond() {
		MockRestServiceServer server = mockServer();
		server.expect(requestTo("https://nominatim.test/search?q=First&format=json&limit=1"))
				.andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
		server.expect(requestTo("https://nominatim.test/search?q=Second&format=json&limit=1"))
				.andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
		Geocoder geocoder = new NominatimGeocoder(builder, PROPERTIES);

		Instant start = Instant.now();
		geocoder.geocode("First");
		geocoder.geocode("Second");
		Duration elapsed = Duration.between(start, Instant.now());

		assertFalse(elapsed.minusMillis(900).isNegative(), "expected at least ~1s between two real lookups");
		server.verify();
	}
}
