package com.wassel.backend.inbox.entity;

/** Why a delivery ended without being sent, or why an attempt failed (docs/contracts/notification-delivery.md). */
public enum DeliveryReason {
	PREFERENCE_OFF,
	NO_RECIPIENT,
	DAILY_CAP,
	PROVIDER_ERROR,
	EXPIRED,
	INTERRUPTED
}
