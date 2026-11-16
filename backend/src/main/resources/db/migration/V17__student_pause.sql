-- SCRUM-270: a student's transport can be paused. PAUSED joins ACTIVE and INACTIVE (INACTIVE is archived and keeps its
-- name, so nothing that already reads it changes). Only ACTIVE students can be on a route, which the code enforces.
-- Follows V16 (notification deliveries, SCRUM-283); docs/contracts/roster.md.

ALTER TABLE students DROP CONSTRAINT students_status_check;
ALTER TABLE students ADD CONSTRAINT students_status_check CHECK (status IN ('ACTIVE', 'PAUSED', 'INACTIVE'));
