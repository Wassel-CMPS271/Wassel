package com.wassel.backend.geocoding.service;

import java.math.BigDecimal;

public record GeocodeResult(BigDecimal latitude, BigDecimal longitude) {
}
