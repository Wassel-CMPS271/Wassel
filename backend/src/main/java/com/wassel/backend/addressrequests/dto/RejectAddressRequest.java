package com.wassel.backend.addressrequests.dto;

import jakarta.validation.constraints.Size;

/** The optional body of a rejection. A blank reason means none. */
public record RejectAddressRequest(
		@Size(max = 255, message = "Reason must be 255 characters or fewer")
		String reason) {

	public RejectAddressRequest {
		reason = reason == null || reason.isBlank() ? null : reason.trim();
	}
}
