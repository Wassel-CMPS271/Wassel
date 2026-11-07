-- SCRUM-209: a student is a stop on at most one route. route_id is a plain id with no foreign key (the
-- same pattern as routes.vehicle_id and routes.driver_id), and stop_position orders the stops on a route.
-- Both are null for a student on no route, so existing rows need no backfill.

ALTER TABLE students ADD COLUMN route_id uuid;

ALTER TABLE students ADD COLUMN stop_position integer;
