-- Baseline schema (SCRUM-199): exactly what Hibernate's ddl-auto=update built before
-- Flyway was added, so a database created that way is the same as one built from this file.
-- Never edit this file once it has run anywhere: schema changes go in a new V<n>__*.sql.

CREATE TABLE drivers (
    id uuid NOT NULL,
    assigned_vehicle_id uuid,
    email character varying(255) NOT NULL,
    first_name character varying(100) NOT NULL,
    invited_at timestamp(6) with time zone NOT NULL,
    last_name character varying(100) NOT NULL,
    phone character varying(30) NOT NULL,
    school_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    user_id uuid,
    CONSTRAINT drivers_status_check CHECK (((status)::text = ANY ((ARRAY['INVITED'::character varying, 'ACTIVE'::character varying, 'DEACTIVATED'::character varying])::text[])))
);

CREATE TABLE login_codes (
    id uuid NOT NULL,
    attempts integer NOT NULL,
    code_hash character varying(64) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    pending_hash character varying(64) NOT NULL,
    sent_at timestamp(6) with time zone NOT NULL,
    used_at timestamp(6) with time zone,
    user_id uuid NOT NULL
);

CREATE TABLE password_tokens (
    id uuid NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    token_hash character varying(64) NOT NULL,
    used_at timestamp(6) with time zone,
    user_id uuid NOT NULL
);

CREATE TABLE routes (
    id uuid NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    driver_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    school_id uuid NOT NULL,
    vehicle_id uuid NOT NULL
);

CREATE TABLE school_half_days (
    id uuid NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    half_day_date date NOT NULL,
    school_id uuid NOT NULL
);

CREATE TABLE school_holidays (
    id uuid NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    holiday_date date NOT NULL,
    name character varying(100) NOT NULL,
    school_id uuid NOT NULL
);

CREATE TABLE school_settings (
    school_id uuid NOT NULL,
    arrival_time time(0) without time zone,
    dismissal_time time(0) without time zone,
    updated_at timestamp(6) with time zone NOT NULL
);

CREATE TABLE students (
    id uuid NOT NULL,
    address character varying(255),
    created_at timestamp(6) with time zone NOT NULL,
    first_name character varying(100) NOT NULL,
    grade character varying(50) NOT NULL,
    guardian_name character varying(100) NOT NULL,
    guardian_phone character varying(30) NOT NULL,
    last_name character varying(100) NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    parent_user_id uuid,
    route character varying(50),
    school_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    CONSTRAINT students_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE users (
    id uuid NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    email character varying(255) NOT NULL,
    enabled boolean NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(32) NOT NULL,
    school_id uuid NOT NULL,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['DRIVER'::character varying, 'PARENT'::character varying, 'HEAD_OF_TRANSPORT'::character varying, 'ADMIN'::character varying])::text[])))
);

CREATE TABLE vehicles (
    id uuid NOT NULL,
    is_active boolean NOT NULL,
    capacity integer NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    plate_number character varying(20) NOT NULL,
    school_id uuid NOT NULL
);

ALTER TABLE drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);

ALTER TABLE login_codes
    ADD CONSTRAINT login_codes_pkey PRIMARY KEY (id);

ALTER TABLE password_tokens
    ADD CONSTRAINT password_tokens_pkey PRIMARY KEY (id);

ALTER TABLE routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);

ALTER TABLE school_half_days
    ADD CONSTRAINT school_half_days_pkey PRIMARY KEY (id);

ALTER TABLE school_holidays
    ADD CONSTRAINT school_holidays_pkey PRIMARY KEY (id);

ALTER TABLE school_settings
    ADD CONSTRAINT school_settings_pkey PRIMARY KEY (school_id);

ALTER TABLE students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);

ALTER TABLE password_tokens
    ADD CONSTRAINT uk52nx8eh3ws1gvhcn9dvtu2y3c UNIQUE (token_hash);

ALTER TABLE users
    ADD CONSTRAINT uk6dotkott2kjsp8vw4d0m25fb7 UNIQUE (email);

ALTER TABLE login_codes
    ADD CONSTRAINT uk9x8s33cl8613yrgtev1fpv5rf UNIQUE (pending_hash);

ALTER TABLE login_codes
    ADD CONSTRAINT ukr59u14gvp26uf2ua7pdvixf7x UNIQUE (user_id);

ALTER TABLE drivers
    ADD CONSTRAINT uq_drivers_school_assigned_vehicle UNIQUE (school_id, assigned_vehicle_id);

ALTER TABLE drivers
    ADD CONSTRAINT uq_drivers_school_email UNIQUE (school_id, email);

ALTER TABLE drivers
    ADD CONSTRAINT uq_drivers_school_phone UNIQUE (school_id, phone);

ALTER TABLE routes
    ADD CONSTRAINT uq_routes_school_driver UNIQUE (school_id, driver_id);

ALTER TABLE routes
    ADD CONSTRAINT uq_routes_school_vehicle UNIQUE (school_id, vehicle_id);

ALTER TABLE school_half_days
    ADD CONSTRAINT uq_school_half_days_school_date UNIQUE (school_id, half_day_date);

ALTER TABLE school_holidays
    ADD CONSTRAINT uq_school_holidays_school_date UNIQUE (school_id, holiday_date);

ALTER TABLE vehicles
    ADD CONSTRAINT uq_vehicles_school_plate_number UNIQUE (school_id, plate_number);

ALTER TABLE users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);

CREATE INDEX idx_password_tokens_user_id ON password_tokens USING btree (user_id);

CREATE INDEX idx_users_school_id ON users USING btree (school_id);
