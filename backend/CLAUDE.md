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
- `users` — the `User` entity and `Role` enum, plus `UserRepository`/`UserService` for other
  modules to look up one of their own school's users by id and role (e.g. students, validating
  a parent-link target), and for auth to find users by email and create accounts. The foundational
  module (see Dependencies below). `config/AdminSeeder` creates the first admin on startup from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` (skipped if unset or the email already exists).
- `schools` — school-level settings. Real module: arrival/dismissal times
  (SCRUM-178), the holiday calendar (SCRUM-101) and half-day marking
  (SCRUM-102) are done. A date can't be both a holiday and a half-day.
- `common` — cross-cutting code that belongs to no single feature:
  `config/SecurityConfig`, `exception/GlobalExceptionHandler`.
- `vehicles` — fleet vehicles: create, set capacity, deactivate/reactivate, with
  validation (SCRUM-163). Real module.
- `drivers` — driver roster: add/invite, resend invite, assign/unassign a vehicle, with
  validation (SCRUM-164). Real module. Depends on `vehicles` (via its service) to check a
  vehicle exists and is active before assigning a driver to it.
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
- No circular dependencies between modules.

## API boundary

DTOs live at the API boundary. Controllers must never return entities directly
— always map to a response DTO.

## Security

- Every endpoint has a `@PreAuthorize` check (`permitAll()` for login/logout,
  `isAuthenticated()` for `/me`). The only public routes are `POST /api/auth/login` and
  `/api/auth/logout`, listed explicitly in `SecurityConfig`.
- Auth is a cookie, so CSRF protection relies on `SameSite=Strict` plus the CORS allow-list
  (`CORS_ALLOWED_ORIGINS`). Frontend and backend must be served from the same site, and the
  frontend must call the API with `credentials: "include"`. If the cookie is ever relaxed, turn
  CSRF protection back on.
- Every query is scoped by `schoolId` (tenant isolation) — never trust a
  school/tenant id from the request; derive it from the authenticated
  principal.

## Tests

Tests mirror the main package structure: a test for
`main/java/com/wassel/backend/schools/controller/SchoolSettingsController.java`
lives at `test/java/com/wassel/backend/schools/controller/SchoolSettingsControllerTests.java`.
