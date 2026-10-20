-- SCRUM-207: a school has at most one pending proposal for all its routes. The proposal row holds the
-- fingerprint of the data it was made from; each planned route is a row in fleet_proposal_routes (route_id is
-- null for a route apply will create, stop_order is comma-joined student ids). Plain ids with no foreign
-- keys, the same as route_proposals; RouteGenerationService deletes both tables' rows together.

CREATE TABLE fleet_proposals (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    fingerprint character varying(100) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT fleet_proposals_pkey PRIMARY KEY (id),
    CONSTRAINT uq_fleet_proposals_school UNIQUE (school_id)
);

CREATE TABLE fleet_proposal_routes (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    route_id uuid,
    name character varying(100) NOT NULL,
    stop_order text NOT NULL,
    CONSTRAINT fleet_proposal_routes_pkey PRIMARY KEY (id)
);
