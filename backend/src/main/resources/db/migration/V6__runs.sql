-- SCRUM-233: one run per route, date and direction, created when today's runs are first asked for. The unique
-- key is what keeps two simultaneous requests from making a second run. Plain ids with no foreign keys, the
-- same as routes.vehicle_id: a run of a deleted route stays as a row nobody lists. started_at and ended_at are
-- here for SCRUM-234; the stops, vehicle and driver of a run are read from its route every time, never stored.

CREATE TABLE runs (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    route_id uuid NOT NULL,
    run_date date NOT NULL,
    direction character varying(20) NOT NULL,
    state character varying(20) NOT NULL,
    started_at timestamp(6) with time zone,
    ended_at timestamp(6) with time zone,
    CONSTRAINT runs_pkey PRIMARY KEY (id),
    CONSTRAINT uq_runs_route_date_direction UNIQUE (route_id, run_date, direction)
);
