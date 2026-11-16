package com.wassel.backend.inbox.service;

import com.wassel.backend.inbox.entity.InboxEventType;
import com.wassel.backend.runs.entity.RunDirection;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * The text of the email for an entry (docs/contracts/notification-delivery.md "What the email says"). Only the child's
 * first name, what happened, when, and the link: nothing else about the child or the run may be added here.
 */
final class DeliveryEmail {

	static final String SUBJECT = "Wassel: an update about your child";

	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

	private DeliveryEmail() {
	}

	static String body(InboxEventType type, String firstName, RunDirection direction, Instant at, ZoneId zone,
			String frontendBaseUrl) {
		String when = direction == RunDirection.MORNING ? "this morning" : "this afternoon";
		String time = TIME.format(at.atZone(zone));
		String what = switch (type) {
			case PICKED_UP -> "%s was picked up %s at %s.".formatted(firstName, when, time);
			case DROPPED_OFF -> "%s was dropped off %s at %s.".formatted(firstName, when, time);
			case NOT_PRESENT -> "%s was not at the stop %s at %s.".formatted(firstName, when, time);
			case LATE -> "%s is running late for %s's pickup (%s).".formatted(firstName, when, time);
		};
		return what + "\n\nSee the details in your Wassel inbox: " + frontendBaseUrl + "/parent";
	}
}
