# Wassel backend — package structure

The backend is organized **by feature, not by layer**. Every feature is its own module
under `com.wassel.backend`, with `controller/`, `service/`, `repository/`, `entity/`,
`dto/`, `exception/`, `config/` subpackages created **only when the module has a class
that needs one**. Don't create empty placeholder folders, and never add a top-level
layer package like `com.wassel.backend.controller` or `com.wassel.backend.service` —
that's the structure this codebase moved away from.

## Current modules

- `auth` — login and sessions (SCRUM-168): `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`. The JWT (HS256) lives only in an HttpOnly, `SameSite=Strict` cookie
  (`wassel_token`), never in a response body. `config/JwtAuthenticationFilter` reads it and
  reloads the `User` on every request (so disabling an account or changing a role is immediate)
  and sets the `User` entity as the principal, which is what controllers' `@AuthenticationPrincipal
  User` expects. Login failures are one generic 401 (unknown email, wrong password, disabled
  account). No refresh tokens. The app refuses to start if `JWT_SECRET` is under 32 bytes.
  Two-factor (SCRUM-172): login is two steps and 2FA has no off switch. `POST /api/auth/login` checks
  the password, emails a 6-digit code through `Mailer` and answers 204 with a pending cookie
  (`wassel_2fa`, HttpOnly, `SameSite=Strict`, 15 min) and no session. `POST /api/auth/2fa/verify
  {code}` exchanges the code for the `wassel_token` session and the user body, and
  `POST /api/auth/2fa/resend` sends a fresh code. The pending token is a random opaque value, not a
  JWT, and `JwtAuthenticationFilter` only reads `wassel_token`, so it can never act as a session.
  `entity/LoginCode` (table `login_codes`, one row per user, unique `user_id`) stores only SHA-256
  hashes of the code and the token. A code lasts 5 minutes and a pending login 15. Five wrong codes
  end the pending login (the user signs in again). A new login or resend is allowed once per 60
  seconds (429); a completed login doesn't count towards that. Attempts, used and resend are
  conditional updates, not read-then-write, so parallel requests can't win twice or get extra
  guesses. A new login deletes the user's row only if it may replace it (used, or older than the
  cooldown): a racing login's fresh row then survives, and the insert hits the unique `user_id`
  instead of both logins getting a code. `TwoFactorService.verify` is `noRollbackFor` its two exceptions so the attempt count
  survives them, which means `AuthService.completeLogin` must never be `@Transactional`. Statuses:
  wrong or expired code 400, pending login gone 401, too soon 429. Logout clears both cookies.
  `TwoFactorService` logs each wrong code at WARN with the user id and attempt number (never the
  code), because the exception handler's line names no user and repeated wrong codes are what a
  guessing attempt looks like. Locally, the code is in the log.
  Password flows (SCRUM-169): `POST /api/auth/forgot-password` (204 for any email, unless the send
  fails; see the limits below; emails a link only
  for an existing, enabled account, at most once per 60 seconds) and `POST /api/auth/password`
  (sets the password from a token, for both first-time set and reset; a bad, expired or used
  token is one generic 400). Tokens (`entity/PasswordToken`) are 32 random bytes, stored only as
  a SHA-256 hash, single-use (a conditional update, so concurrent requests can't both win), valid
  24h for an invite and 30min for a reset, and a new token voids the user's older ones. Passwords
  are 10+ characters and at most 72 UTF-8 bytes (BCrypt's limit, `dto/MaxBytes`). After a password
  is set, auth publishes `event/PasswordSetEvent`; other modules listen (drivers does), so auth
  never imports them. `service/Mailer` sends email (links point at `FRONTEND_BASE_URL`), and which
  implementation runs is decided by profile (SCRUM-187): `SmtpMailer` everywhere except `local` and
  `test`, where `LoggingMailer` prints the email, link or login code included, to the log instead.
  The split is by `@Profile`, so a deployed environment can't print a code or link, and if the two
  ever drift there are zero or two `Mailer` beans and startup fails. `SmtpMailer` uses
  `spring-boot-starter-mail` with `MAIL_HOST`/`MAIL_PORT`/`MAIL_USERNAME`/`MAIL_PASSWORD` (Gmail and an
  app password for now; Gmail sends as the signed-in account whatever the from address says, so the
  sender is `MAIL_USERNAME`). A failed send throws, which rolls back the caller's transaction (no
  login code or token is left behind) and answers a generic 500, so the user retries; the cause is
  logged at ERROR. The send runs inside the request's transaction, so `spring.mail` has 5 second
  timeouts; they are per network step, so they bound a hang, not the whole send. A missing
  `MAIL_USERNAME` stops startup, but a missing `MAIL_PASSWORD` does not (Boot binds it as the literal
  text), so `docker-compose.staging.yml` is what refuses to start without it.
  Known limits: a password change does not revoke existing sessions (tokens are stateless); the
  fix is a "tokens valid from" timestamp on `User` checked by `JwtAuthenticationFilter`. And
  anyone who knows an email can call forgot-password once a minute; each new link voids the
  previous one, so they can keep that person's link from working and fill their inbox. Someone who
  has a user's password can try 5 login codes a minute (about 7,200 a day against a million codes)
  and, by logging in every minute, keep that user's code from being usable; the fix is account
  lockout (SCRUM-171, skipped for now). Limits that real email adds:
  - **Forgot-password reveals which emails have accounts.** An unknown email, or one in its cooldown,
    answers 204 at once; a registered one waits for the send (a second or so) and is a 500 if Gmail
    fails. The old "always 204, reveals nothing" held only because logging took no time. Accepted
    for now. The fix is to send off the request thread and always answer 204. Login is not affected:
    its email only goes out after a correct password.
  - **One account can stop every login.** Login and forgot-password each allow one email a minute
    per account, about 1,440 a day, against Gmail's roughly 500. Once Gmail refuses, every login
    answers 500, because 2FA has no off switch. Account lockout and a provider with a higher limit are
    the fixes; Gmail is not meant for real users.
  - The forgot-password cooldown is read-then-write and a slow send widens that window, so parallel
    requests for one account can each send an email.
  - If Gmail accepts a message but the reply times out, the transaction rolls back and the user holds
    a code or link that doesn't work; they ask for another.
  - Each login opens a fresh encrypted connection to Gmail inside the request, so it takes a second or
    more longer than when the email was only logged (not measured).
- `users` — the `User` entity and `Role` enum, plus `UserRepository`/`UserService` for other
  modules to look up one of their own school's users by id and role (e.g. students, validating
  a parent-link target), and for auth to find users by email and create accounts. The foundational
  module (see Dependencies below). `config/AdminSeeder` creates the first admin on startup from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` (skipped if unset or the email already exists).
  An invited account has no password yet: it stores the sentinel hash `User.NO_PASSWORD_HASH`
  (`"!"`, since `password_hash` is NOT NULL), `User.hasPassword()` tells it apart, and login treats
  it like an unknown email. `UserService.createInvitedUser` creates one. Emails are unique across
  the whole platform, not per school (a taken email is a 409 with `errors.email`).
- `schools` — school-level settings. Real module: arrival/dismissal times
  (SCRUM-178), the holiday calendar (SCRUM-101) and half-day marking
  (SCRUM-102) are done. A date can't be both a holiday and a half-day.
- `common` — cross-cutting code that belongs to no single feature:
  `config/SecurityConfig`, `exception/GlobalExceptionHandler`.
- `vehicles` — fleet vehicles: create, set capacity, deactivate/reactivate, with
  validation (SCRUM-163). Real module.
- `drivers` — driver roster: add/invite, resend invite, assign/unassign a vehicle, with
  validation (SCRUM-164). Real module. Depends on `vehicles` (via its service) to check a
  vehicle exists and is active before assigning a driver to it. Adding a driver also creates an
  invited DRIVER account and emails the set-password link (resend sends a fresh one, and creates
  the account for drivers added before accounts existed); the driver moves from INVITED to ACTIVE
  when they set a password. Depends on `auth` (`PasswordService`, `PasswordSetEvent`) and `users`.
- `accounts` — invited accounts (SCRUM-169): the head of transportation invites and lists their
  school's parents (`/api/head-of-transport/parents`), and the admin invites head of
  transportation accounts into the admin's school (`/api/admin/head-of-transport`). No names yet,
  the `User` only has an email. Depends on `auth` and `users`.
- `students` — student roster. Real module: add, list, search/filter by query/status/grade/route
  (SCRUM-167), and editing address, map-pin location, and parent-linking (SCRUM-166) are done.
  CSV import and the active/inactive toggle are not built yet, and there's no endpoint to assign
  a student's route (the `route` column exists for filtering; it's expected to be populated by a
  future routing feature, not edited by hand here).

## Where things go

- Cross-cutting code (used by every module, owned by none) goes in `common/`.
- Config specific to one module (e.g. JWT settings) goes in that module's own
  `config/`, not in `common/`.
- A genuinely new feature gets a new top-level module, not a subpackage of an
  existing one.

## Exceptions

- Module-specific exceptions live in that module's own `exception/` package
  (e.g. `schools.exception.InvalidSchoolTimesException`).
- `common.exception.GlobalExceptionHandler` is the single place that maps
  exceptions to HTTP responses. It is the **only** code in `common` allowed to
  reference module classes (it `@ExceptionHandler`s module-specific exception
  types).
- Module code must not import anything from `common.exception`, not even for a
  Javadoc `{@link}`. If you need to describe how an exception is handled,
  say so in plain text instead of linking to `GlobalExceptionHandler`.

## Naming

Follow the existing `schools` module as the template, e.g. for a new `vehicles`
module: `VehicleController`, `VehicleService`, `VehicleRepository`, `Vehicle`
(entity), `CreateVehicleRequest` / `VehicleResponse` (dto).

## Dependencies between modules

- `users` is the foundational module. Any module may reference
  `users.entity.User` and `users.entity.Role` directly.
- Any other cross-module reference goes through the owning module's **service**
  layer, never its repository or entity classes directly.
- No circular dependencies between modules. `drivers` and `accounts` depend on `auth`; `auth`
  never imports them and publishes events (`auth.event`) instead.

## API boundary

DTOs live at the API boundary. Controllers must never return entities directly
— always map to a response DTO.

## Security

- Every endpoint has a `@PreAuthorize` check (`permitAll()` for the public auth routes,
  `isAuthenticated()` for `/me`). The only public routes are `POST /api/auth/login`,
  `/api/auth/2fa/verify`, `/api/auth/2fa/resend`, `/api/auth/logout`, `/api/auth/forgot-password`
  and `/api/auth/password`, listed explicitly in `SecurityConfig`.
- Auth is a cookie, so CSRF protection relies on `SameSite=Strict` plus the CORS allow-list
  (`CORS_ALLOWED_ORIGINS`). Frontend and backend must be served from the same site, and the
  frontend must call the API with `credentials: "include"`. If the cookie is ever relaxed, turn
  CSRF protection back on.
- Every query is scoped by `schoolId` (tenant isolation) — never trust a
  school/tenant id from the request; derive it from the authenticated
  principal. The exceptions are `password_tokens` and `login_codes`, which are looked up by the
  token itself, before any school is known.

## Logging

- Log through SLF4J (`@Slf4j`), never `System.out`.
- Errors a client causes (validation, conflicts, not found, forbidden) are logged at WARN
  in `common.exception.GlobalExceptionHandler`, message only. Unexpected failures are ERROR
  with the stack trace. Don't add logging to individual controllers for these.
- Output is ECS JSON (see `application.yml`), so put data in the message, not in
  free-text that needs parsing.

## Tests

Tests mirror the main package structure: a test for
`main/java/com/wassel/backend/schools/controller/SchoolSettingsController.java`
lives at `test/java/com/wassel/backend/schools/controller/SchoolSettingsControllerTests.java`.
