package com.wassel.backend.inbox.entity;

/** Where an email delivery is (docs/contracts/notification-delivery.md). {@code SENT}, {@code FAILED} and {@code SKIPPED} are final. */
public enum DeliveryStatus {
	PENDING,
	SENDING,
	SENT,
	FAILED,
	SKIPPED
}
