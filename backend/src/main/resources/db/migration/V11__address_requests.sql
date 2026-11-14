-- SCRUM-269: a parent's request to change a child's pickup address, until the head of transportation decides it.
-- The student, name, address and parent are copied when the request is made, so a row reads the same later.
-- Plain ids with no foreign keys, as in runs and absences.
--
-- The partial unique index is the guarantee that a child never has two pending requests, however many requests
-- race to insert one. It is the backstop: the service first takes a per-student lock (AddressRequestRepository.lockStudent)
-- and checks existsByStudentIdAndStatus, so a second request normally sees the first one pending.

CREATE TABLE address_requests (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    student_name varchar(255) NOT NULL,
    current_address varchar(255),
    requested_address varchar(255) NOT NULL,
    requested_lat numeric(9,6),
    requested_lng numeric(9,6),
    requested_by_user_id uuid NOT NULL,
    requested_by_email varchar(255) NOT NULL,
    status varchar(16) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    decided_at timestamp(6) with time zone,
    rejection_reason varchar(255),
    CONSTRAINT address_requests_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_address_requests_one_pending_per_student ON address_requests (student_id)
    WHERE status = 'PENDING';

-- The head of transportation's list: one school, one status, oldest first.
CREATE INDEX idx_address_requests_school_status ON address_requests (school_id, status, created_at);
