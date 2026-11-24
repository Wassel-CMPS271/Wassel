-- SCRUM-289: one row per authentication email we asked the provider to send (sign-in code, resend, reset link, invite
-- link), so the daily cap can count them (docs/contracts/auth-email.md). Plain ids with no foreign keys, as in V16, and
-- no email address: a row says who and what kind, never where. created_at is written by the app from its Clock, so a
-- test can cross midnight. A new kind needs a migration that widens the CHECK.
-- Follows V17 (student pause, SCRUM-270).

CREATE TABLE auth_emails (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind varchar(16) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT auth_emails_pkey PRIMARY KEY (id),
    -- The names of AuthEmailKind.
    CONSTRAINT auth_emails_kind_check CHECK (kind IN ('LOGIN_CODE', 'RESEND_CODE', 'RESET_LINK', 'INVITE_LINK'))
);

-- Today's count, and today's count of one kind.
CREATE INDEX idx_auth_emails_created_at ON auth_emails (created_at);
-- One account's count today.
CREATE INDEX idx_auth_emails_user_created_at ON auth_emails (user_id, created_at);
