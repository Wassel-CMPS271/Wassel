-- SCRUM-264: one row per driver reassignment made through a run. The route's driver changes from now on, so
-- a row holds the route and the run's date as well as the run the head acted on, and a run's history is every
-- row of its route on its date. Plain ids with no foreign keys, as in runs and run_confirmations. Written in the
-- same transaction as the route's new driver; a refused or no-op request writes nothing. A FINISHED run is never
-- reassigned, so the state is checked here too.
-- V14 is provisional: renamed to the next free number when it merges (docs/contracts/runs.md, Interfaces).

CREATE TABLE run_reassignments (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    run_id uuid NOT NULL,
    route_id uuid NOT NULL,
    run_date date NOT NULL,
    run_state character varying(20) NOT NULL,
    from_driver_id uuid NOT NULL,
    to_driver_id uuid NOT NULL,
    changed_by_user_id uuid NOT NULL,
    changed_at timestamp(6) with time zone NOT NULL,
    reason character varying(200),
    CONSTRAINT run_reassignments_pkey PRIMARY KEY (id),
    CONSTRAINT run_reassignments_run_state_check CHECK (run_state IN ('NOT_STARTED', 'IN_PROGRESS'))
);

CREATE INDEX idx_run_reassignments_school_route_date ON run_reassignments (school_id, route_id, run_date);
