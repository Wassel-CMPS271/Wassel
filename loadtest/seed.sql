-- Seeds one normal school for the load test (SCRUM-293): 1 head of transportation, 40 buses with 40 drivers and 40
-- routes, 1,000 students on those routes (25 a route) and 800 parent accounts (the first 200 parents have two
-- children). Run ONCE on a fresh throwaway stack, after the backend has started (Flyway has made the tables):
--   docker compose exec postgres psql -U loadtest -d wassel -v ON_ERROR_STOP=1 -f /seed/seed.sql
-- Every account signs in with the password below; the stack is never reachable from outside.
\set school '00000000-0000-0000-0000-000000000001'

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM students) OR EXISTS (SELECT 1 FROM vehicles) THEN
    RAISE EXCEPTION 'The database is not empty: run "docker compose down -v" and start the stack again';
  END IF;
END $$;

-- One BCrypt hash (cost 10, the same as the app's) for every account.
SELECT crypt('LoadTest-Pass-1', gen_salt('bf', 10)) AS pw \gset

INSERT INTO school_settings (school_id, arrival_time, dismissal_time, updated_at)
VALUES (:'school'::uuid, '08:00', '14:30', now())
ON CONFLICT (school_id) DO UPDATE SET arrival_time = '08:00', dismissal_time = '14:30', updated_at = now();

CREATE TEMP TABLE bus AS
SELECT g AS n, gen_random_uuid() AS vehicle_id, gen_random_uuid() AS driver_id, gen_random_uuid() AS driver_user_id,
       gen_random_uuid() AS route_id
FROM generate_series(1, 40) g;

INSERT INTO vehicles (id, is_active, capacity, created_at, plate_number, school_id)
SELECT vehicle_id, true, 30, now(), 'LT-' || lpad(n::text, 3, '0'), :'school'::uuid FROM bus;

INSERT INTO users (id, created_at, email, enabled, password_hash, role, school_id)
SELECT driver_user_id, now(), 'driver' || n || '@load.test', true, :'pw', 'DRIVER', :'school'::uuid FROM bus;

INSERT INTO drivers (id, assigned_vehicle_id, email, first_name, invited_at, last_name, phone, school_id, status, user_id)
SELECT driver_id, vehicle_id, 'driver' || n || '@load.test', 'Driver', now(), 'No' || n,
       '+9613' || lpad(n::text, 6, '0'), :'school'::uuid, 'ACTIVE', driver_user_id FROM bus;

INSERT INTO routes (id, created_at, driver_id, name, school_id, vehicle_id)
SELECT route_id, now(), driver_id, 'Route ' || n, :'school'::uuid, vehicle_id FROM bus;

INSERT INTO users (id, created_at, email, enabled, password_hash, role, school_id)
VALUES (gen_random_uuid(), now(), 'head@load.test', true, :'pw', 'HEAD_OF_TRANSPORT', :'school'::uuid);

CREATE TEMP TABLE parent AS SELECT g AS n, gen_random_uuid() AS user_id FROM generate_series(1, 800) g;

INSERT INTO users (id, created_at, email, enabled, password_hash, role, school_id)
SELECT user_id, now(), 'parent' || n || '@load.test', true, :'pw', 'PARENT', :'school'::uuid FROM parent;

-- 1,000 students: student i rides bus ((i-1) % 40) + 1 at stop ((i-1) / 40) + 1, and belongs to parent ((i-1) % 800) + 1.
-- Homes are spread over about 4 km around the school, with a pin, as the real app would have after geocoding.
INSERT INTO students (id, address, created_at, first_name, grade, guardian_name, guardian_phone, last_name,
                      latitude, longitude, parent_user_id, route, school_id, status, route_id, stop_position, manual_pin)
SELECT gen_random_uuid(), 'Street ' || i, now(), 'Student', 'Grade ' || (1 + i % 12), 'Guardian ' || (1 + (i - 1) % 800),
       '+9617' || lpad((1 + (i - 1) % 800)::text, 6, '0'), 'No' || i,
       round((33.8938 + (random() - 0.5) * 0.04)::numeric, 6), round((35.5018 + (random() - 0.5) * 0.04)::numeric, 6),
       p.user_id, NULL, :'school'::uuid, 'ACTIVE', b.route_id, ((i - 1) / 40) + 1, true
FROM generate_series(1, 1000) i
JOIN parent p ON p.n = ((i - 1) % 800) + 1
JOIN bus b ON b.n = ((i - 1) % 40) + 1;

SELECT (SELECT count(*) FROM users WHERE role = 'PARENT') AS parents,
       (SELECT count(*) FROM users WHERE role = 'DRIVER') AS drivers,
       (SELECT count(*) FROM vehicles) AS buses,
       (SELECT count(*) FROM routes) AS routes,
       (SELECT count(*) FROM students) AS students;
