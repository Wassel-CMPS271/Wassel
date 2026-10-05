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
  Password flows (SCRUM-169): `POST /api/auth/forgot-password` (always 204; emails a link only
  for an existing, enabled account, at most once per 60 seconds) and `POST /api/auth/password`
  (sets the password from a token, for both first-time set and reset; a bad, expired or used
  token is one generic 400). Tokens (`entity/PasswordToken`) are 32 random bytes, stored only as
  a SHA-256 hash, single-use (a conditional update, so concurrent requests can't both win), valid
  24h for an invite and 30min for a reset, and a new token voids the user's older ones. Passwords
  are 10+ characters and at most 72 UTF-8 bytes (BCrypt's limit, `dto/MaxBytes`). After a password
  is set, auth publishes `event/PasswordSetEvent`; other modules listen (drivers does), so auth
  never imports them. `service/Mailer` sends email; its only implementation, `LoggingMailer`,
  prints the email, link included, to the application log (links point at `FRONTEND_BASE_URL`).
  **Anyone who can read the logs can take over an account through those links: add an SMTP
  `Mailer` and limit `LoggingMailer` to the local/test profiles before inviting any real user.**
  Known limits: a password change does not revoke existing sessions (tokens are stateless); the
  fix is a "tokens valid from" timestamp on `User` checked by `JwtAuthenticationFilter`. And
  anyone who knows an email can call forgot-password once a minute; each new link voids the
  previous one, so they can keep that person's link from working and fill their inbox.
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
  `/api/auth/logout`, `/api/auth/forgot-password` and `/api/auth/password`, listed explicitly in
  `SecurityConfig`.
- Auth is a cookie, so CSRF protection relies on `SameSite=Strict` plus the CORS allow-list
  (`CORS_ALLOWED_ORIGINS`). Frontend and backend must be served from the same site, and the
  frontend must call the API with `credentials: "include"`. If the cookie is ever relaxed, turn
  CSRF protection back on.
- Every query is scoped by `schoolId` (tenant isolation) — never trust a
  school/tenant id from the request; derive it from the authenticated
  principal. The one exception is `password_tokens`, which is looked up by the token itself.

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
