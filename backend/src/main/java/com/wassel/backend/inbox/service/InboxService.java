package com.wassel.backend.inbox.service;

import com.wassel.backend.inbox.dto.InboxEventResponse;
import com.wassel.backend.inbox.dto.UnreadCountResponse;
import com.wassel.backend.inbox.entity.InboxEvent;
import com.wassel.backend.inbox.entity.InboxEventType;
import com.wassel.backend.inbox.exception.InboxEventNotFoundException;
import com.wassel.backend.inbox.repository.InboxEventRepository;
import com.wassel.backend.runs.event.ConfirmationRecordedEvent;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A parent's inbox (SCRUM-267, docs/contracts/inbox.md). The school and the parent always come from the authenticated
 * user, and every statement is scoped by both.
 */
@Service
@RequiredArgsConstructor
public class InboxService {

	private final InboxEventRepository inboxEventRepository;

	private final StudentService studentService;

	private final NotificationPreferenceService preferenceService;

	private final Clock clock;

	/**
	 * Makes the entry for a driver's confirmation. Runs in the transaction that saves the confirmation, so the two
	 * exist together or not at all, and a repeated event makes no second entry (the unique key). A child with no
	 * linked parent has nobody to tell, and a parent who turned this type off (SCRUM-268) is not told.
	 */
	@EventListener
	@Transactional
	public void recordConfirmation(ConfirmationRecordedEvent event) {
		StudentResponse student = studentService.getStudent(event.schoolId(), event.studentId());
		if (student.parentUserId() == null) {
			return;
		}
		InboxEventType type = InboxEventType.valueOf(event.status());
		if (!preferenceService.receives(event.schoolId(), student.parentUserId(), type)) {
			return;
		}
		inboxEventRepository.insertIfMissing(event.schoolId(), student.parentUserId(), event.studentId(),
				student.firstName() + " " + student.lastName(), event.runId(), event.direction(), type.name(),
				event.occurredAt());
	}

	/**
	 * Makes the late alert for a child still waiting (SCRUM-268), unless this run already made one for the child
	 * (the unique key, so every later call is a no-op). Answers whether an entry was made. The caller has checked the
	 * parent's choices.
	 */
	@Transactional
	public boolean recordLate(UUID schoolId, UUID parentUserId, UUID runId, StudentResponse student, String direction,
			Instant at) {
		return inboxEventRepository.insertIfMissing(schoolId, parentUserId, student.id(),
				student.firstName() + " " + student.lastName(), runId, direction, InboxEventType.LATE.name(), at) == 1;
	}

	/** The newest 50 entries, newest first; only the unread ones when {@code unreadOnly}. */
	@Transactional(readOnly = true)
	public List<InboxEventResponse> list(UUID schoolId, UUID parentUserId, boolean unreadOnly) {
		List<InboxEvent> events = unreadOnly
				? inboxEventRepository.findTop50BySchoolIdAndParentUserIdAndReadAtIsNullOrderByCreatedAtDescIdDesc(
						schoolId, parentUserId)
				: inboxEventRepository.findTop50BySchoolIdAndParentUserIdOrderByCreatedAtDescIdDesc(schoolId,
						parentUserId);
		return events.stream().map(InboxEventResponse::of).toList();
	}

	@Transactional(readOnly = true)
	public UnreadCountResponse unreadCount(UUID schoolId, UUID parentUserId) {
		return new UnreadCountResponse(
				inboxEventRepository.countBySchoolIdAndParentUserIdAndReadAtIsNull(schoolId, parentUserId));
	}

	/** Marks one entry read and answers with it. Reading it again changes nothing and keeps the first time. */
	@Transactional
	public InboxEventResponse markRead(UUID schoolId, UUID parentUserId, UUID id) {
		inboxEventRepository.markRead(schoolId, parentUserId, id, Instant.now(clock));
		return inboxEventRepository.findBySchoolIdAndParentUserIdAndId(schoolId, parentUserId, id)
				.map(InboxEventResponse::of)
				.orElseThrow(() -> new InboxEventNotFoundException("Inbox entry not found."));
	}

	@Transactional
	public void markAllRead(UUID schoolId, UUID parentUserId) {
		inboxEventRepository.markAllRead(schoolId, parentUserId, Instant.now(clock));
	}
}
