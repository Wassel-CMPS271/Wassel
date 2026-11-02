-- SCRUM-171: account lockout. failed_sign_ins counts wrong passwords in a row (a correct one resets it, a lock
-- starts it over); locked_until is when a lock ends, null when the account has never been locked. A lock ends
-- by itself once locked_until is past, so nothing has to clear it.

ALTER TABLE users ADD COLUMN failed_sign_ins integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until timestamp(6) with time zone;
