-- SCRUM-263: the keys a driver's device sends with a confirmation so a replay after a lost answer is one effect.
-- One row per key, written in the same transaction as the confirmation it answers (and on the "already had this
-- status" path too, so a double tap's second key is also remembered). A key is one driver's: two drivers may send the
-- same value. Plain ids with no foreign keys, like run_confirmations; rows are never pruned (tiny, one per tap).

CREATE TABLE confirmation_keys (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    driver_user_id uuid NOT NULL,
    client_request_id uuid NOT NULL,
    run_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT confirmation_keys_pkey PRIMARY KEY (id),
    CONSTRAINT uq_confirmation_keys_driver_key UNIQUE (driver_user_id, client_request_id)
);
