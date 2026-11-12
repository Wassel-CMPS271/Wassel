-- SCRUM-267: a parent's inbox. One row per run event about a child (picked up, dropped off, not present), made when
-- the driver's confirmation is saved. The parent, the child's name and the run's direction are copied then, so a row
-- reads the same later. Plain ids with no foreign keys, as in runs.
--
-- The unique key is what makes a business event produce one entry however many times it is processed
-- (InboxEventRepository.insertIfMissing relies on it).

CREATE TABLE inbox_events (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    parent_user_id uuid NOT NULL,
    student_id uuid NOT NULL,
    student_name varchar(255) NOT NULL,
    run_id uuid NOT NULL,
    direction varchar(16) NOT NULL,
    type varchar(16) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    read_at timestamp(6) with time zone,
    CONSTRAINT inbox_events_pkey PRIMARY KEY (id),
    CONSTRAINT uq_inbox_events_event UNIQUE (run_id, student_id, type)
);

-- A parent's list (newest first, all or unread) and unread count.
CREATE INDEX idx_inbox_events_parent ON inbox_events (school_id, parent_user_id, created_at DESC);
