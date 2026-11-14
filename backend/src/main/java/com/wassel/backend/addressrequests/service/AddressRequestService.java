package com.wassel.backend.addressrequests.service;

import com.wassel.backend.addressrequests.dto.AddressRequestResponse;
import com.wassel.backend.addressrequests.dto.SubmitAddressRequest;
import com.wassel.backend.addressrequests.entity.AddressRequest;
import com.wassel.backend.addressrequests.entity.AddressRequestStatus;
import com.wassel.backend.addressrequests.exception.AddressRequestConflictException;
import com.wassel.backend.addressrequests.exception.AddressRequestNotFoundException;
import com.wassel.backend.addressrequests.exception.InvalidAddressRequestException;
import com.wassel.backend.addressrequests.repository.AddressRequestRepository;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.dto.UpdateStudentAddressRequest;
import com.wassel.backend.students.dto.UpdateStudentLocationRequest;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.exception.StudentNotActiveException;
import com.wassel.backend.students.exception.StudentNotFoundException;
import com.wassel.backend.students.service.StudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Address-change requests (SCRUM-269, docs/contracts/address-requests.md). The school and the parent always come
 * from the authenticated user. The student is only touched through {@link StudentService}, and only by an approval.
 */
@Service
@RequiredArgsConstructor
public class AddressRequestService {

	private final AddressRequestRepository addressRequestRepository;

	private final StudentService studentService;

	private final Clock clock;

	/**
	 * A parent asks for a new address for their child. The child is checked with {@code findChildOf} first, so
	 * another parent's, another school's and an unknown child are one 404. The advisory lock on the student makes
	 * "one pending request per child" hold when two requests arrive together: the second sees the first's row.
	 */
	@Transactional
	public AddressRequestResponse submit(UUID schoolId, UUID parentUserId, String parentEmail, UUID studentId,
			SubmitAddressRequest request) {
		StudentResponse student = studentService.findChildOf(schoolId, parentUserId, studentId)
				.orElseThrow(() -> new StudentNotFoundException("Child not found."));
		if ((request.latitude() == null) != (request.longitude() == null)) {
			throw new InvalidAddressRequestException(request.latitude() == null ? "latitude" : "longitude",
					"Latitude and longitude must be given together");
		}
		boolean hasPin = request.latitude() != null;
		if (!hasPin && request.address().equalsIgnoreCase(student.address())) {
			throw new InvalidAddressRequestException("address", "This is already the saved address");
		}
		if (!isActive(student)) {
			throw new StudentNotActiveException("Only active students can have an address request.");
		}
		addressRequestRepository.lockStudent(studentId);
		if (addressRequestRepository.existsByStudentIdAndStatus(studentId, AddressRequestStatus.PENDING)) {
			throw new AddressRequestConflictException("This child already has a pending address request.");
		}
		AddressRequest saved = addressRequestRepository.save(AddressRequest.builder()
				.schoolId(schoolId)
				.studentId(studentId)
				.studentName(student.firstName() + " " + student.lastName())
				.currentAddress(student.address())
				.requestedAddress(request.address())
				.requestedLat(request.latitude())
				.requestedLng(request.longitude())
				.requestedByUserId(parentUserId)
				.requestedByEmail(parentEmail)
				.status(AddressRequestStatus.PENDING)
				.createdAt(Instant.now(clock))
				.build());
		return AddressRequestResponse.of(saved);
	}

	/** The requests this parent sent for their child, newest first, every status. */
	@Transactional(readOnly = true)
	public List<AddressRequestResponse> listForChild(UUID schoolId, UUID parentUserId, UUID studentId) {
		studentService.findChildOf(schoolId, parentUserId, studentId)
				.orElseThrow(() -> new StudentNotFoundException("Child not found."));
		return addressRequestRepository
				.findBySchoolIdAndStudentIdAndRequestedByUserIdOrderByCreatedAtDesc(schoolId, studentId, parentUserId)
				.stream().map(AddressRequestResponse::of).toList();
	}

	/** The school's requests with this status, oldest first. */
	@Transactional(readOnly = true)
	public List<AddressRequestResponse> list(UUID schoolId, AddressRequestStatus status) {
		return addressRequestRepository.findBySchoolIdAndStatusOrderByCreatedAtAsc(schoolId, status).stream()
				.map(AddressRequestResponse::of).toList();
	}

	/**
	 * Approves a pending request and saves its address (and pin, if it has one) on the student, in this one
	 * transaction: if the student can't take it, the request stays pending. The address goes through
	 * {@code StudentService.updateAddress}, so it is geocoded unless the student has a manual pin, exactly like the
	 * head's own edit; a pin from the parent is then saved as a manual pin.
	 */
	@Transactional
	public AddressRequestResponse approve(UUID schoolId, UUID requestId) {
		AddressRequest request = lockPending(schoolId, requestId);
		StudentResponse student = studentService.getStudent(schoolId, request.getStudentId());
		if (!isActive(student)) {
			throw new StudentNotActiveException("Only active students can have an address request.");
		}
		studentService.updateAddress(schoolId, request.getStudentId(),
				new UpdateStudentAddressRequest(request.getRequestedAddress()));
		if (request.getRequestedLat() != null) {
			studentService.updateLocation(schoolId, request.getStudentId(),
					new UpdateStudentLocationRequest(request.getRequestedLat(), request.getRequestedLng()));
		}
		return decide(request, AddressRequestStatus.APPROVED, null);
	}

	/** Rejects a pending request. The student is not touched, so this works whatever the student's status. */
	@Transactional
	public AddressRequestResponse reject(UUID schoolId, UUID requestId, String reason) {
		return decide(lockPending(schoolId, requestId), AddressRequestStatus.REJECTED, reason);
	}

	/**
	 * The request with its row locked, so a second decision of it waits and then finds it decided. Another school's
	 * request is the same 404 as an unknown one.
	 */
	private AddressRequest lockPending(UUID schoolId, UUID requestId) {
		AddressRequest request = addressRequestRepository.findLockedBySchoolIdAndId(schoolId, requestId)
				.orElseThrow(() -> new AddressRequestNotFoundException("Address request not found."));
		if (request.getStatus() != AddressRequestStatus.PENDING) {
			throw new AddressRequestConflictException("This request was already " + request.getStatus().name().toLowerCase(Locale.ROOT)
					+ " at " + request.getDecidedAt() + ".");
		}
		return request;
	}

	private AddressRequestResponse decide(AddressRequest request, AddressRequestStatus status, String reason) {
		request.setStatus(status);
		request.setDecidedAt(Instant.now(clock));
		request.setRejectionReason(reason);
		return AddressRequestResponse.of(request);
	}

	private static boolean isActive(StudentResponse student) {
		return StudentStatus.ACTIVE.name().equalsIgnoreCase(student.status());
	}
}
