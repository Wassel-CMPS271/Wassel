-- SCRUM-203: a route has at most one pending optimizer proposal, and every applied proposal keeps the
-- order it replaced as a version. Orders are comma-joined student ids in stop order. Plain ids with no
-- foreign keys, the same as routes.vehicle_id; RouteService deletes both tables' rows with the route.

CREATE TABLE route_proposals (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    route_id uuid NOT NULL,
    base_order text NOT NULL,
    proposed_order text NOT NULL,
    CONSTRAINT route_proposals_pkey PRIMARY KEY (id),
    CONSTRAINT uq_route_proposals_route UNIQUE (route_id)
);

CREATE TABLE route_versions (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    route_id uuid NOT NULL,
    stop_order text NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT route_versions_pkey PRIMARY KEY (id)
);
