-- SCRUM-238: a parent reports a child absent for one day or a date range; cancelling it either
-- marks it cancelled (hasn't started yet) or shortens it to end yesterday (already started).
-- cancelled rows are kept as history, never deleted (see absences.entity.Absence).
--
-- btree_gist lets a GiST exclusion constraint use plain "=" on student_id alongside the date
-- range overlap operator (&&). That constraint is the race-condition backstop for
-- AbsenceService's overlap check, the same role the unique constraints on routes/school_holidays
-- play for theirs: it makes it physically impossible for two non-cancelled absences of the same
-- student to ever overlap, however many requests or app instances race to insert one.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE absences (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    created_by uuid NOT NULL,
    cancelled boolean NOT NULL DEFAULT false,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT absences_pkey PRIMARY KEY (id),
    CONSTRAINT excl_absences_student_overlap EXCLUDE USING gist (
        student_id WITH =,
        daterange(from_date, to_date, '[]') WITH &&
    ) WHERE (NOT cancelled)
);

-- Supports the head of transportation's "who is absent on this date" query, which scans a whole
-- school rather than one student.
CREATE INDEX idx_absences_school_date ON absences (school_id, from_date, to_date) WHERE NOT cancelled;
