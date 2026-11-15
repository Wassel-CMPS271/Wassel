-- SCRUM-283: the email that goes with an inbox entry (docs/contracts/notification-delivery.md). One row per entry,
-- made by the sender when it finds the entry (NotificationDeliveryRepository.discover), so the driver's confirmation
-- never writes here. The unique key on the entry is what makes an entry get one delivery however many times, or from
-- however many instances, the sender runs (a provider that times out after accepting an email can still cost a second
-- send of it: see the contract's "At most once"). Plain ids with no foreign keys, as in inbox_events.
-- Follows V15 (notification preferences, SCRUM-268).

CREATE TABLE notification_deliveries (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    inbox_event_id uuid NOT NULL,
    status varchar(16) NOT NULL,
    attempts integer NOT NULL,
    next_attempt_at timestamp(6) with time zone NOT NULL,
    claimed_at timestamp(6) with time zone,
    sent_at timestamp(6) with time zone,
    reason varchar(32),
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id),
    CONSTRAINT uq_notification_deliveries_event UNIQUE (inbox_event_id),
    CONSTRAINT notification_deliveries_status_check
        CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
    -- The names of DeliveryReason; a new reason needs a migration that widens this.
    CONSTRAINT notification_deliveries_reason_check
        CHECK (reason IS NULL OR reason IN ('PREFERENCE_OFF', 'NO_RECIPIENT', 'DAILY_CAP', 'PROVIDER_ERROR', 'EXPIRED',
                                            'INTERRUPTED')),
    CONSTRAINT notification_deliveries_attempts_check CHECK (attempts >= 0),
    -- A sent delivery says when, and a delivery that was ever claimed says when.
    CONSTRAINT notification_deliveries_sent_at_check CHECK (status <> 'SENT' OR sent_at IS NOT NULL),
    CONSTRAINT notification_deliveries_claimed_at_check CHECK (status NOT IN ('SENDING', 'SENT') OR claimed_at IS NOT NULL)
);

-- What is due to be sent, oldest first.
CREATE INDEX idx_notification_deliveries_due ON notification_deliveries (status, next_attempt_at);
-- The admin's summary of a day.
CREATE INDEX idx_notification_deliveries_school_day ON notification_deliveries (school_id, created_at);
-- The sender looks for entries made in the last hour (additive, on SCRUM-267's table).
CREATE INDEX idx_inbox_events_created_at ON inbox_events (created_at);
