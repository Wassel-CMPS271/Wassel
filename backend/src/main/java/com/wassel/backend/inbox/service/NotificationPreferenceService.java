package com.wassel.backend.inbox.service;

import com.wassel.backend.inbox.dto.NotificationPreferencesResponse;
import com.wassel.backend.inbox.dto.UpdateNotificationPreferencesRequest;
import com.wassel.backend.inbox.entity.InboxEventType;
import com.wassel.backend.inbox.repository.NotificationPreferenceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * A parent's notification choices (SCRUM-268, docs/contracts/inbox.md "Notification preferences"). The school and the
 * parent always come from the authenticated user. A choice applies to entries made after it is saved: nothing already in
 * the inbox is removed or added.
 */
@Service
@RequiredArgsConstructor
public class NotificationPreferenceService {

	private final NotificationPreferenceRepository preferenceRepository;

	private final Clock clock;

	/** The parent's saved choices, or the defaults when they never saved any. */
	@Transactional(readOnly = true)
	public NotificationPreferencesResponse get(UUID schoolId, UUID parentUserId) {
		return preferenceRepository.findBySchoolIdAndParentUserId(schoolId, parentUserId)
				.map(NotificationPreferencesResponse::of).orElse(NotificationPreferencesResponse.DEFAULTS);
	}

	/** Replaces all of the parent's choices and answers with them. Saving the same choices again changes nothing. */
	@Transactional
	public NotificationPreferencesResponse update(UUID schoolId, UUID parentUserId,
			UpdateNotificationPreferencesRequest request) {
		preferenceRepository.upsert(schoolId, parentUserId, request.pickedUp(), request.droppedOff(),
				request.notPresent(), request.late(), request.lateAfterMinutes(), Instant.now(clock));
		return new NotificationPreferencesResponse(request.pickedUp(), request.droppedOff(), request.notPresent(),
				request.late(), request.lateAfterMinutes());
	}

	/** Whether this parent wants entries of this type now. */
	@Transactional(readOnly = true)
	public boolean receives(UUID schoolId, UUID parentUserId, InboxEventType type) {
		NotificationPreferencesResponse choices = get(schoolId, parentUserId);
		return switch (type) {
			case PICKED_UP -> choices.pickedUp();
			case DROPPED_OFF -> choices.droppedOff();
			case NOT_PRESENT -> choices.notPresent();
			case LATE -> choices.late();
		};
	}
}
