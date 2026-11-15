-- SCRUM-261: a driver's opt-in to share a run's position, and the latest position (no history). One row per run,
-- created by the opt-in only, so a late position can never create it again after a withdrawal. Withdrawing or ending
-- the run keeps the row with sharing false and the position emptied. Plain ids with no foreign keys, as in runs.

CREATE TABLE run_locations (
    run_id uuid NOT NULL,
    school_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    sharing boolean NOT NULL,
    latitude double precision,
    longitude double precision,
    accuracy_meters double precision,
    received_at timestamp(6) with time zone,
    CONSTRAINT run_locations_pkey PRIMARY KEY (run_id)
);
