package com.wassel.backend.addressrequests.dto;

import com.wassel.backend.addressrequests.entity.AddressRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/** An address request as docs/contracts/address-requests.md shows it; {@code status} is lower case, like a student's. */
public record AddressRequestResponse(UUID id, UUID studentId, String studentName, String currentAddress,
		String requestedAddress, BigDecimal requestedLat, BigDecimal requestedLng, RequestedBy requestedBy,
		String status, Instant createdAt, Instant decidedAt, String rejectionReason) {

	public record RequestedBy(UUID parentUserId, String email) {
	}

	public static AddressRequestResponse of(AddressRequest request) {
		return new AddressRequestResponse(request.getId(), request.getStudentId(), request.getStudentName(),
				request.getCurrentAddress(), request.getRequestedAddress(), request.getRequestedLat(),
				request.getRequestedLng(), new RequestedBy(request.getRequestedByUserId(),
						request.getRequestedByEmail()),
				request.getStatus().name().toLowerCase(Locale.ROOT), request.getCreatedAt(), request.getDecidedAt(),
				request.getRejectionReason());
	}
}
