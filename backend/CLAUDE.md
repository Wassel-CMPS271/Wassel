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
  Brevo (SCRUM-197): `BrevoMailer` sends through Brevo's HTTPS API (`POST /v3/smtp/email`, key in the `api-key`
  header) for hosts that block outbound SMTP, such as Railway outside its Pro plan. `wassel.mail.provider`
  (`MAIL_PROVIDER`, default `smtp`) picks `SmtpMailer` or `BrevoMailer`; both are also limited to the
  `!local & !test` profiles, so there is still exactly one `Mailer` in every setup (`MailerProfileTests`) and a
  deployed environment never prints a code. `brevo` needs `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` (an address
  verified in the Brevo account, since Brevo only sends from a verified sender); a blank one stops startup, and
  `MAIL_USERNAME`/`MAIL_PASSWORD` are then unused. Same failure rule as SMTP: a rejected or timed-out send
  (5 s) throws, so the caller's transaction rolls back and the user retries. The exception carries only its
  type: never the key or the response body, which can echo the recipient. Local and staging keep SMTP.
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
  (SCRUM-178), the holiday calendar — add, list, delete (SCRUM-101/214) — and half-day marking
  (SCRUM-102) are done. A date can't be both a holiday and a half-day.
- `demo` - an opt-in seeder for the demo school (SCRUM-200). `config/DemoDataSeeder` runs on startup only
  when `DEMO_DATA_ENABLED=true` (the bean doesn't exist otherwise) and `service/DemoDataService` creates a
  head of transportation, a parent, vehicles, drivers (active, with the demo password, no invite email),
  students (with address and pin, two linked to the parent) and school times, always through the other
  modules' services. Idempotent: every step looks for what it would create first, and school times that
  are already set are kept. The guard: if any account exists beyond the demo ones and the seeded admin, it
  logs a warning and does nothing unless `DEMO_DATA_FORCE=true`. Demo emails are `DEMO_EMAIL_BASE` with a
  `+tag` (`demo+head@...`), so on a deployed environment, where sign-in emails a code, pointing the base
  at a real Gmail-style mailbox lets every demo account receive its code. Accounts are unique across the
  platform, so the seeder serves one school (the seeded admin's). Needs `DEMO_PASSWORD` (10+ characters).
  Setup is in the README ("Demo data"). Depends on `users`, `schools`, `vehicles`, `drivers`, `students`.
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
- `geocoding` — turns a free-text address into coordinates via the public Nominatim instance
  (SCRUM-211). `service/Geocoder` is the interface other modules use (`students` is the only
  caller so far); `NominatimGeocoder` is the only implementation, throttled to at most one
  request per second (`synchronized` on a tracked last-request time) and caching every answer,
  including "not found", by the trimmed address text, so the same address is never requested
  twice. A failed or empty lookup returns `Optional.empty()`, never an exception — that's an
  expected outcome, not a server error — but only a real answer is cached: a lookup that fails
  (an error, or no answer in time) is retried next time, so a short outage doesn't leave an
  address "not found" until a restart. Requests time out after 5 s (`NOMINATIM_TIMEOUT`, connect
  and read) because the call runs inside `StudentService.updateAddress`'s transaction and would
  otherwise hold a database connection while Nominatim hangs. Results are restricted to Lebanon
  (`NOMINATIM_COUNTRY_CODES`, default `lb`, blank turns it off): without a country a street name
  alone resolves to its best match worldwide ("Verdun Street" is in Sydney). The address goes
  into the query as a URI variable, so characters like `{ } % & # +` and Arabic text arrive
  intact. Tests that save an address mock `Geocoder` (`@MockitoBean`) so no test makes a real
  request. `RestClient.Builder` isn't auto-configured by
  `spring-boot-starter-webmvc` alone, so `config/GeocodingConfig` provides it as a bean itself.
  Manual check against 20 real Lebanese addresses (2026-10-16): 18/20 hit, both misses were
  deliberately informal/landmark-style addresses ("near the old bakery, Furn El Chebbak") rather
  than a street or town name — matches the ticket's expectation that informal addresses are the
  case the manual-pin fallback exists for.
- `students` — student roster. Real module: add (with an optional address, SCRUM-213), list,
  search/filter by query/status/grade/route (SCRUM-167), and editing address, map-pin location,
  and parent-linking (SCRUM-166) are done. CSV import and the active/inactive toggle are not
  built yet. The old `route` string column
  exists for filtering only and is never written; real route membership (SCRUM-209) is
  `routeId`/`stopPosition`, a student is a stop on at most one route, and `stopPosition` is a
  watermark (next = current max + 1 on that route), not a compacted sequence — removing a stop
  never renumbers another student's position, and display order always comes from sorting by it,
  never from its raw value. `StudentService.assignToRoute`/`removeFromRoute`/`countOnRoute`/
  `listOnRoute`/`isOnRoute`/`clearRoute`/`reorderRoute` are for the `routes` module to call; this
  module never imports `routes` (it takes a plain route id, the same way `route` is a plain
  string). `reorderRoute` (SCRUM-210) replaces a route's whole order at once: unlike
  `assignToRoute`'s watermark, it rewrites positions as a clean `1..n`, and rejects (via
  `InvalidStopOrderException`) a list that repeats a student or doesn't contain exactly the
  route's current stops. Setting an address — at creation (SCRUM-213) or via the update endpoint
  (SCRUM-211, via `geocoding.service.Geocoder`) — re-geocodes it, unless `manualPin` is set, in
  which case the pin is never touched regardless of what the address becomes; a failed or empty
  lookup clears any previous (non-manual) pin rather than leaving it pointing at the old address.
  `updateLocation` (the hand-correction endpoint) sets `manualPin = true`. A brand-new student
  never has a manual pin yet, so `addStudent` geocodes unconditionally when given an address.
- `routes` — a school's routes (SCRUM-208), which students ride each one (SCRUM-209), their
  hand-set order (SCRUM-210), and each stop's arrival time (SCRUM-212), under
  `/api/head-of-transport/routes`. A vehicle or driver can be on at most one route (checked in
  `RouteService`, backed by a unique constraint on `Route` as the race-condition backstop); an
  inactive vehicle or deactivated driver can't be assigned (there's no deactivate endpoint for
  drivers yet; the check exists for when one lands). Adding a student checks capacity against the
  route's current occupants before resolving the student (so a full route 409s even for an
  unknown student id, and re-adding a student already on this exact route skips the check — no
  new seat taken), then only an active student can be added, and a student already on another
  route is moved rather than rejected. Deleting a route releases its students
  (`StudentService.clearRoute`) so none are left pointing at a dead route id.
  `studentCount`/`seatsLeft`/`stops` are computed fresh from `StudentService` on every response,
  never cached on `Route`. Each stop's `arrivalTime` (`RouteService.schedule`) uses
  `routing.service.RouteTimings` over only the pinned stops, in position order, and is null for
  every stop when the school's arrival time isn't set, no stop has a pin, or the computed
  schedule isn't drivable (`Timing.startsTooEarly()`) — the contract treats "would start before
  06:00" the same as "no schedule" rather than publishing an unrealistic one. Depends on
  `vehicles` (`VehicleService.getOwnedVehicle`), `drivers` (`DriverService.getOwnedDriver`),
  `students` (`StudentService`) and `routing` (`TravelTimes`, `RouteTimings`) for eligibility and
  timing, and `schools` (`SchoolSettingsService.getTimes`) plus the
  `schools.config.SchoolLocationProperties` (`wassel.school.latitude`/`longitude`, required — the
  app refuses to start without it) for the `Route.school` block. Response shapes follow
  `docs/contracts/routing.md`.
  Optimization (SCRUM-203): `propose` asks `routing.service.RouteOptimizer` for an order and saves it as the
  route's one pending proposal (`entity/RouteProposal`, table `route_proposals`, unique `route_id`; it holds
  the route's order when it was made, `baseOrder`, and the suggestion, `proposedOrder`). Every propose
  that gets as far as the optimizer clears the old proposal first, even when the new answer is infeasible
  (then nothing is saved and `id` is null); one rejected with a 409 for no stops, no school arrival time
  or an unpinned stop leaves it alone. Two proposes at once end in a 409 from the unique key. `current` comes from the same
  `schedule` the route's own arrival times use. `applyProposal` claims the proposal with a bulk delete
  that reports how many rows it removed (`RouteProposalRepository.claim`), so two applies can't both win
  and the loser gets the 404 of a proposal that is gone; it then answers 409 if the route's ordered student
  ids differ from `baseOrder` (that rolls the claim back, so the proposal stays), saves the replaced order
  as a `RouteVersion` (`route_versions`) and calls `StudentService.reorderRoute`. Discarding an unknown or
  already-gone proposal is a 404, like apply. Versions are only stored: nothing lists or restores them
  yet, and a manual reorder (SCRUM-210) doesn't make one. Orders are comma-joined ids in a `text` column
  (`UuidListConverter`), not a join table or `uuid[]`, so the column stays a plain type that Hibernate and the
  Flyway migrations describe the same way. Deleting a route deletes its proposal and versions in `RouteService.deleteRoute`
  (there are no foreign keys). Known limit: a manual reorder or student change that commits between
  apply's comparison and its write is overwritten; closing it needs a route-row lock that every
  stop-changing method also takes. The solve runs inside the propose transaction (at most 2 s, plus up to the road provider's 3 s timeout when the
  matrix is not cached).
  Generate all (SCRUM-207): `RouteGenerationController` under `/api/head-of-transport/routes/generation` (generate, apply,
  discard) and `RouteGenerationService`, mirroring SCRUM-203 with one proposal per school (`entity/FleetProposal`, table
  `fleet_proposals`, unique `school_id`; its planned routes are `FleetProposalRoute` rows; migration V5). `collect` reads the
  school once (active students, routes with their members, vehicles, drivers, arrival time) and both generate and apply use it.
  A vehicle is planned when it is active and its driver is ACTIVE: the driver of the route it is already on, or else its
  assigned driver, who must not be on another route. Other active vehicles are `excludedVehicles` with a message, so an INVITED
  driver is excluded here although `RouteService` accepts one. `generate` is not transactional: it reads and saves in two
  `TransactionTemplate` transactions around `FleetPlanner.plan`, and a `ConcurrentHashMap` set allows one generation per school
  at a time (409, this process only). The proposal keeps a fingerprint, four SHA-256 prefixes (students with pins, planned
  vehicles with capacity and driver, routes with members in order, arrival time). `apply` claims the proposal (a second apply is
  a 404), recollects, and answers 409 naming the parts that differ (the claim rolls back, so the proposal stays); a student who
  is gone or inactive by the time they are placed gets the same 409, not the student module's 404. Generate's save deletes the
  proposal row before its route rows, the order apply and discard use: the other order deadlocked against an apply on PostgreSQL
  (reproduced by replaying both transactions in two sessions). It updates the
  route of a planned vehicle (name and driver kept) or creates one (`<plate> morning run`, the vehicle's assigned driver) with
  `routeRepository.saveAndFlush`, not `RouteService.createRoute`, because that swallows `DataIntegrityViolationException` and a
  failed flush would poison the surrounding transaction. Then `StudentService.placeOnRoutes` replaces each written route's students
  (releases them, then positions 1..n, moving a student off any other route) and the answer is `RouteService.listRoutes`. Routes of
  vehicles that are not planned are left alone. Active students without a pin are `unplaced` with `NO_PIN`, a `RouteOptimizer.Code`
  only this endpoint produces. There is no undo: apply logs the previous studentId:routeId:position map at INFO. Known limits: a
  manual edit that commits between apply's comparison and its writes is overwritten (as in 203); single-route proposals are not
  cleared by an apply (a stale one answers 409 on its own); generating 150 students on 10 vehicles took 13.5 s on straight-line
  times and applying 0.26 s, and each generate can spend road-provider requests (about one for the fleet, none above 58 students,
  plus one per route, when uncached). Not checked: the deployed proxy's timeout for a request that long. A planned vehicle
  that the solver gives no students but whose route has students is listed with no stops and those students in `leaving`, and
  apply empties that route (`placeOnRoutes` with an empty list). Still not shown: a route of an excluded vehicle that a moved
  student leaves (the contract's known limit). Independent tests (SCRUM-216, by Moustafa):
  `RouteGenerationCriteriaTests`, written from the ticket, not from `RouteGenerationControllerTests` or
  `FleetPlannerTests` (the author's own suites for this and SCRUM-206). Besides re-checking the AC's four rules through
  a fresh set of scenarios, it adds coverage neither existing suite had: two `generate` calls for the same school at
  once, which the service already guards against (a `ConcurrentHashMap` key per school) but nothing exercised — the
  second now reliably gets 409 while the first is still solving a 60-student fleet, and the guard releases correctly
  once it finishes.
- `routing` — the contracts the route features code against (SCRUM-201) and the solver behind them
  (SCRUM-202). `service/RouteOptimizer` orders one route's stops and `service/TravelTimes` gives a
  driving-time matrix between points, so the road provider client (SCRUM-204) plugs in without its
  callers changing. `StraightLineTravelTimes` (30 km/h, rounded up to whole minutes) is the stand-in
  and the fallback.
  Road times (SCRUM-204): `OpenRouteServiceTravelTimes` is the `@Primary` `TravelTimes`; it posts to
  OpenRouteService's matrix endpoint (`driving-car`, longitude first, seconds rounded up to whole minutes) with
  the key from `ORS_API_KEY` in the `Authorization` header (never a query parameter, because
  `RestClientException` messages carry the URL and are logged). A blank key is not an error: the client logs one
  warning at startup and never calls out, so local runs and CI get straight-line times (the `test` profile blanks
  it so an exported key can't change test numbers), but `docker-compose.staging.yml` refuses to start without it.
  Every ordered pair is cached in memory, keyed to 1e-5 degrees (about 1 m; also what is sent), and not persisted:
  a restart costs the first request per route, and ORS durations don't depend on traffic so nothing expires. When
  any pair of a request is missing the **whole point set** goes in one request, not only the missing pairs: the
  free plan (40 a minute, 500 a day, about 3,500 routes so at most 59 points a request) counts requests, and one new
  stop would otherwise need two, its row and its column. So "each pair is requested at most once" holds as "a route
  whose pairs are all known never calls the provider". A `null` cell (no route) takes the straight-line value and is
  cached. It never throws and caches nothing from a failed or malformed answer. If any pair is still unknown after a
  fetch, the **whole** matrix is straight-line, never road legs mixed with straight-line ones (the mix made the optimizer
  answer `ARRIVAL_TIME_UNREACHABLE` during an outage), and the provider is left alone for 60 s after a 429, a 5xx or a timeout (a route response waits on this while it
  holds a database connection, so a dead provider must not cost each request a timeout, hence the 3 s `timeout`),
  and for 1 h after a 401/403 (quota used up or a wrong key; not told apart on purpose). Any other 4xx, or more than
  59 distinct points, leaves only that point set alone for an hour, so one pin more than 350 m from a road can't use
  up the day's quota by being asked about on every page load. Moving the pin changes the set. One lock serialises
  provider calls, and the cache empties when it passes 100,000 pairs. Known limit: legs are rounded up one by one,
  so a long route of short legs reads longer than the drive. A route response or propose can wait up to that 3 s
  timeout on an uncached matrix, behind one lock, while holding its database connection. Checked against the real
  provider (2026-10-18, a free key): the key is accepted raw in the `Authorization` header, the live test passed with
  real Beirut road times, and the answer carries more than `durations` (`sources`, `destinations` with
  `snapped_distance`, `metadata`), which is ignored. Its responses carry `X-Ratelimit-Limit: 50`, `-Remaining` and a
  `-Reset` 24 hours out, which reads as 50 requests a day for that key, not the 500 the plans page lists: unconfirmed,
  but it makes the cache and the pauses matter more. One 502 (an HTML gateway page) appeared once and did not repeat,
  and was handled as a failure. The real answers to a wrong key and to a pin with no road nearby were not checked; the
  401/403 and other-4xx handling above rests on the provider's documentation and forum reports. Independent tests
  for this client (SCRUM-215, by Moustafa): `OpenRouteServiceTravelTimesCriteriaTests` and
  `OpenRouteServiceApiKeyCriteriaTests`, written from the ticket and the `TravelTimes` contract, not from
  `OpenRouteServiceTravelTimesHttpTests` (Hashem's own suite). Found one narrow gap while reviewing: `fetch()`
  writes a point set's results to the cache inside the lock, but a caller reads its own just-fetched values back
  *outside* the lock; a different, concurrently fetched point set that trips the 100,000-pair cache clear in that
  gap can evict them first, so a fetch that actually succeeded falls back to straight-line for that one call.
  Needs the cache near its size limit and two different point sets fetched within microseconds of each other, so
  it is unlikely to matter for one school's worth of routes; flagged on the PR rather than fixed here or given a
  (necessarily flaky) test. `OrToolsRouteOptimizer` is the only `RouteOptimizer`: Google OR-Tools
  (`ortools-java`, native libraries loaded on the first solve), guided local search seeded with the
  given order (50 ms per stop, capped at 2 s) and never worse than that order. It asks for one
  matrix per route and checks capacity first. `RouteTimings` is the one place the arrival-time rule
  is written (backwards from the school's arrival time); the propose endpoint's `current` and the
  route's own arrival times must use it rather than redo the arithmetic. A first pickup before
  `RouteTimings.EARLIEST_FIRST_PICKUP` (06:00, a constant while there is one school) or before
  midnight makes a plan `ARRIVAL_TIME_UNREACHABLE`. Run the packaged jar once after upgrading
  `ortools-java`: the natives are extracted at runtime, and a container that mounts `/tmp` as
  `noexec` fails to load them.
  Fleet planning (SCRUM-206): `FleetPlanner.plan` splits students across vehicles and orders each route; it only
  proposes (the `routes` module's `RouteGenerationService` saves it, SCRUM-207). One OR-Tools model over one matrix assigns students within each vehicle's seats and a
  driving time of at most arrival − 06:00, with every student droppable at a penalty larger than any driving, then each
  route goes back through `RouteOptimizer` on its own matrix. Above 58 students the whole-fleet matrix is straight-line
  (the road client refuses more than 59 points without spending a request) but each route still gets road times; a route
  that fails 06:00 on its own times has its students reported `ARRIVAL_TIME_UNREACHABLE` rather than kept. Left-out
  students are `CAPACITY_EXCEEDED` when there are more students than seats, otherwise `ARRIVAL_TIME_UNREACHABLE`. The
  caller passes only pinned active students and vehicles that have a driver. The search is time-limited (50 ms a student,
  at most 5 s, plus up to 2 s a route; 12.5 s measured at 150 students), so answers vary between runs and tests assert
  rules, not exact splits; don't run it inside a transaction. A solver that finds nothing throws rather than report
  everyone unplaced. Other modules use `routing.service` only, never anything deeper, and `routing` imports
  no other module: it takes plain `Coordinate`s and ids so it does not depend on the routes
  entities. The JSON shapes, endpoint table and rules are in `docs/contracts/routing.md`, with
  samples in `docs/contracts/samples/routing/`; change them by pull request that tags the owners.

## Where things go

- Cross-cutting code (used by every module, owned by none) goes in `common/`.
- Config specific to one module (e.g. JWT settings) goes in that module's own
  `config/`, not in `common/`.
- A genuinely new feature gets a new top-level module, not a subpackage of an
  existing one.

## Database schema (SCRUM-199)

- **Schema changes go in a migration, never in `ddl-auto`.** Flyway runs `src/main/resources/db/migration/V<n>__short_description.sql`
  on startup. `V1__baseline_schema.sql` is the schema as it was when Flyway was added.
- Changing an entity's columns, constraints or indexes means adding the next `V<n>` file in the same PR. Never edit a
  migration that has been merged: Flyway checksums them, so an edit stops every database that already ran it.
- `ddl-auto` is `validate` in every profile that runs on PostgreSQL (local, staging, production): Hibernate only checks
  that the entities match the schema, so a forgotten migration stops startup with a clear error instead of reaching users.
- Tests use the same setup (SCRUM-252): the `test` profile runs on a real PostgreSQL 16 in a Testcontainers
  container, Flyway runs every migration, and Hibernate validates the schema against them. So a green test run
  does prove the migrations are right, and a PostgreSQL-only bug fails CI instead of the deployed app.
- A local database made before Flyway existed is adopted as V1 automatically (`baseline-on-migrate` in `application-local.yml`).

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

**Running them needs Docker running** (Docker Desktop on Windows or Mac): the tests start a PostgreSQL container
(`postgres:16`, pulled the first time). Then `./mvnw test` (or `mvnw.cmd test` on Windows) works as before; without
Docker the Spring tests fail at startup with "Could not find a valid Docker environment". CI's Ubuntu runners
already have Docker, so the backend job still just runs `mvn -B verify`. `application-test.yml` uses the
Testcontainers JDBC URL `jdbc:tc:postgresql:16:///wassel`, which starts one container on first use and shares it
with every test context in the run, so the schema is migrated once. All tests share that one database, so a test
that needs its own data should use its own school id or unique values, as the existing ones do. There is no H2
anymore: don't add it back, and don't add a test that depends on a table or column no migration creates.

Tests mirror the main package structure: a test for
`main/java/com/wassel/backend/schools/controller/SchoolSettingsController.java`
lives at `test/java/com/wassel/backend/schools/controller/SchoolSettingsControllerTests.java`.
