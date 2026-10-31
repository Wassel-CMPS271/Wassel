-- SCRUM-235: what the driver did with each student on a run. One row per run, student and status, so a retry
-- of the same tap (INSERT ... ON CONFLICT DO NOTHING) cannot make a second one, and a student's history is
-- kept: PICKED_UP stays when DROPPED_OFF follows. The latest status is the highest one, not the newest row.
-- Plain ids with no foreign keys, the same as runs.route_id: a student or run that is gone leaves rows nobody lists.
-- The index serves the "is this student on a bus today" check, which has the student and no run.

CREATE TABLE run_confirmations (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    run_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    confirmed_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT run_confirmations_pkey PRIMARY KEY (id),
    CONSTRAINT uq_run_confirmations_run_student_status UNIQUE (run_id, student_id, status)
);

CREATE INDEX idx_run_confirmations_school_student ON run_confirmations (school_id, student_id);
