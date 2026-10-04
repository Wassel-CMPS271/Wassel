package com.wassel.backend.students.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateStudentAddressRequest(
		@NotBlank(message = "Address is required")
		String address) {

	public UpdateStudentAddressRequest {
		address = address == null ? null : address.trim();
	}
}
