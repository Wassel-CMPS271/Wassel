package com.wassel.backend.addressrequests.repository;

import com.wassel.backend.addressrequests.entity.AddressRequest;
import com.wassel.backend.addressrequests.entity.AddressRequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Every query is scoped by school id, so callers can't read or modify across the tenant boundary. */
public interface AddressRequestRepository extends JpaRepository<AddressRequest, UUID> {

	/**
	 * Takes a PostgreSQL advisory lock on this student until the transaction ends, so two submissions for one child
	 * run one after the other and the second sees the first one's pending row (the same lock and reason as
	 * {@code AbsenceRepository#lockStudent}). The partial unique index stays as the backstop.
	 */
	@Query(value = "SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(CAST(:studentId AS text), 0))",
			nativeQuery = true)
	int lockStudent(@Param("studentId") UUID studentId);

	boolean existsByStudentIdAndStatus(UUID studentId, AddressRequestStatus status);

	Optional<AddressRequest> findBySchoolIdAndId(UUID schoolId, UUID id);

	/**
	 * The request with its row locked until the transaction ends. A decision takes it, so two decisions of one
	 * request run one after the other and the second one sees it already decided (409).
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<AddressRequest> findLockedBySchoolIdAndId(UUID schoolId, UUID id);

	List<AddressRequest> findBySchoolIdAndStatusOrderByCreatedAtAsc(UUID schoolId, AddressRequestStatus status);

	List<AddressRequest> findBySchoolIdAndStudentIdAndRequestedByUserIdOrderByCreatedAtDesc(UUID schoolId,
			UUID studentId, UUID requestedByUserId);
}
