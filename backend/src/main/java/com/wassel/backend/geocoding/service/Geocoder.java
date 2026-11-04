package com.wassel.backend.geocoding.service;

import java.util.Optional;

/**
 * Turns a free-text address into a map pin. {@code Optional.empty()} means the lookup found
 * nothing or failed — never an exception, since an address that doesn't geocode is an expected
 * outcome (SCRUM-211), not a server error. {@code NominatimGeocoder} is the only implementation;
 * the interface exists so a second provider (e.g. Photon) could swap in without its caller
 * (students) changing, the same reason {@code routing.service.TravelTimes} is an interface.
 */
public interface Geocoder {

	Optional<GeocodeResult> geocode(String address);
}
