-- SCRUM-268: which notifications a parent receives and how late a pickup must be before they are told. One row per
-- parent, made the first time they save their choices; a parent with no row has the defaults (everything on, ten
-- minutes), which the code supplies, so the table never needs a row for a parent who never changed anything. Plain
-- ids with no foreign keys, as in runs and inbox_events.
-- V15 is provisional: renamed to the next free number when it merges, because V13 (SCRUM-263) and V14 (SCRUM-264) are
-- still open (docs/contracts/inbox.md, Notification preferences).

CREATE TABLE notification_preferences (
    parent_user_id uuid NOT NULL,
    school_id uuid NOT NULL,
    picked_up boolean NOT NULL,
    dropped_off boolean NOT NULL,
    not_present boolean NOT NULL,
    late boolean NOT NULL,
    late_after_minutes integer NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT notification_preferences_pkey PRIMARY KEY (parent_user_id),
    CONSTRAINT notification_preferences_late_after_check CHECK (late_after_minutes BETWEEN 5 AND 60)
);
