package com.wassel.backend.students.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateStudentAddressRequest(
		@NotBlank(message = "Address is required")
		@Size(max = 255, message = "Address must be 255 characters or fewer")
		String address) {

	public UpdateStudentAddressRequest {
		address = address == null ? null : address.trim();
	}
}
