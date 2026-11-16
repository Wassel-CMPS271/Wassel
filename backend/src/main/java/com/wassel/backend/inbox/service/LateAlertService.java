package com.wassel.backend.inbox.service;

import com.wassel.backend.inbox.dto.NotificationPreferencesResponse;
import com.wassel.backend.inbox.entity.NotificationPreference;
import com.wassel.backend.runs.dto.WaitingStop;
import com.wassel.backend.runs.service.RunService;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * Late alerts (SCRUM-268, docs/contracts/inbox.md "Late alerts"): puts an entry of type {@code LATE} in the inbox of the
 * parent of each child who is still waiting on a morning run and is late by that parent's own rule ({@link LateRule}),
 * if they have not turned late alerts off. {@link #raise} is the whole job and is safe to call as often as you like
 * and from several instances: an entry is made once per run and child (the inbox's unique key), so a repeat, a retry or
 * a second instance makes nothing more. It is not transactional, because reading the runs can wait on the road provider;
 * each entry is its own small transaction. A stop that fails is logged and left for the next call.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LateAlertService {

	/** Only morning runs have planned times, so a late alert is only ever about a morning run. */
	private static final String DIRECTION = "MORNING";

	private final RunService runService;

	private final StudentService studentService;

	private final NotificationPreferenceService preferenceService;

	private final InboxService inboxService;

	private final Clock clock;

	/** Makes the alerts that are due now and answers how many entries it made. */
	public int raise() {
		Instant now = Instant.now(clock);
		int made = 0;
		for (WaitingStop stop : runService.waitingStopsToday()) {
			// Nobody can ask for less than the shortest delay, so a stop that is not late by it has nothing to look up.
			if (!LateRule.isLate(stop, now, NotificationPreference.MIN_LATE_AFTER_MINUTES)) {
				continue;
			}
			try {
				if (alert(stop, now)) {
					made++;
				}
			}
			catch (RuntimeException e) {
				log.error("Could not make the late alert for student {} on run {}; the next call tries again",
						stop.studentId(), stop.runId(), e);
			}
		}
		return made;
	}

	private boolean alert(WaitingStop stop, Instant now) {
		StudentResponse student = studentService.getStudent(stop.schoolId(), stop.studentId());
		if (student.parentUserId() == null) {
			return false;
		}
		NotificationPreferencesResponse choices = preferenceService.get(stop.schoolId(), student.parentUserId());
		if (!choices.late() || !LateRule.isLate(stop, now, choices.lateAfterMinutes())) {
			return false;
		}
		return inboxService.recordLate(stop.schoolId(), student.parentUserId(), stop.runId(), student, DIRECTION, now);
	}
}
