# SCRUM-228 — Independent solver and optimization tests

Owner: Wassim Fawaz
Sprint: 2 — Integrate / Deploy
Status: **Local verification passed; ready for CI and independent review**

## Scope and constraints

The Sprint 2 plan assigns independent tests of the route solver and optimization endpoints to Wassim (SCRUM-228). It explicitly calls out the invariant **“capacity never exceeded.”** The routing contract (SCRUM-201), solver (SCRUM-202, PR #47), and propose / apply / discard endpoints (SCRUM-203, PR #66) are now present. Expectations below come from the contract, not the author's test helpers.

The executable JUnit tests use the real optimizer. Solver tests supply deterministic directed travel times and test the real road-client fallback through an HTTP test adapter. API tests use real services and H2 repositories, with no test transaction, optimizer mock, or repository mock. The fixture files in `fixtures/` remain *domain examples*, **not the production API schema**: their 10/14, 14/14, 15/14 and A-B-C scenarios are translated to typed inputs and UUIDs in the tests rather than copied into another fixture format.

## Required invariants (independent of the chosen implementation)

1. **Capacity**: an accepted route must not contain more students than its assigned vehicle's seat capacity; do not silently drop students to make it appear valid.
2. **Stop integrity**: optimizing order must not lose or duplicate the requested stops. If grouping multiple students at one stop is supported, adapt the invariant to student memberships rather than raw stop counts.
3. **Proposal isolation**: generating an optimization *preview* must not modify the saved route.
4. **Explicit apply**: only applying a valid proposal may persist its new order.
5. **Discard safety**: discarding a proposal must leave the saved route unchanged.
6. **School/time rules**: respect agreed school arrival/dismissal constraints and travel-time semantics when defined in SCRUM-201.
7. **Authorization/scope**: route operations may only expose or mutate data belonging to the authenticated school/role. Verify at endpoint layer when available.

## Test matrix

| ID | Scenario and setup | Expected observation | Level |
|---|---|---|---|
| SOL-01 | Active vehicle capacity 14, 10 distinct students at 10 stops | Feasible result; students/stops preserved; count <= 14 | Solver unit |
| SOL-02 | Vehicle capacity 14, 14 students | Capacity boundary accepted if other constraints are satisfied | Solver unit |
| SOL-03 | Vehicle capacity 14, 15 students | `Plan` is not feasible: a `CAPACITY_EXCEEDED` reason, no stops, zero driving time. Over the endpoint: 201 with `feasible: false`, `id: null`, `proposed: null`, `reasons` | Solver + endpoint |
| SOL-04 | Route with no students | Direct optimizer input returns a feasible empty plan and zero time; the endpoint rejects an empty route with 409 and a `detail` | Solver + endpoint |
| SOL-05 | Route with one stop | Exactly one stop; no new stop or lost assignment | Solver unit |
| SOL-06 | Stops have repeated coordinates but distinct student IDs | Each student remains assigned exactly once | Solver unit |
| SOL-07 | Travel time missing/provider failure | Use only the documented fallback or return a defined error; no silent fabrication | Solver unit |
| SOL-08 | Impossible arrival/deadline time constraints | First pickup at exactly 06:00 is allowed; one minute earlier or before midnight is infeasible with `ARRIVAL_TIME_UNREACHABLE`, empty stops and zero time | Solver + endpoint |
| OPT-01 | Saved order A-B-C; request proposal | Persisted order remains A-B-C until apply | Optimization service/controller |
| OPT-02 | Proposal exists; explicitly apply it | New order persists after reload; selected stop/student set unchanged | Optimization service/controller |
| OPT-03 | Proposal exists; discard it | Stored route/order unchanged | Optimization service/controller |
| OPT-04 | Same route receives a new version before applying old proposal | Apply answers 409 when the route's stops or their order changed since the proposal; a discarded, replaced or unknown proposal answers 404 | Optimization service/controller |
| OPT-05 | Unauthorized or other-school route | 404 (another school's route is indistinguishable from a missing one); no data modified | Controller/security |
| OPT-06 | Missing or invalid route/proposal ID | 400 for malformed UUIDs; 404 for an unknown route or proposal; 409 for a route with no stops, no school arrival time, or stops without a pin; no 500, no state change | Controller |

## Executable coverage

- `backend/src/test/java/com/wassel/backend/routing/service/IndependentRouteOptimizerTests.java`: SOL-01..08. Checks full student multisets, directed-leg costs, forward-simulated arrivals (without `RouteTimings`), manual-order cost, the exact 06:00 boundary, midnight infeasibility, and coordinate/pin validation. SOL-07 runs the real optimizer with the real `OpenRouteServiceTravelTimes` against a controlled 503, checking the documented straight-line fallback.
- `backend/src/test/java/com/wassel/backend/routes/controller/IndependentRouteOptimizationTests.java`: OPT-01..06 through MockMvc and the actual `RouteService`. Checks committed assignments after preview/discard, exact applied order after GET/repository reload, complete version contents/ownership across two applies, stale order/add/remove rejection and claim rollback, proposal replacement, school/role/anonymous authorization, unknown and malformed UUIDs, empty routes, unset arrival time, missing/partial pins, and infeasible 201 answers that clear older proposals.
- API fixtures use a new three-stop meridian route, not the solver author's sample: A-B-C takes 13 minutes, A-C-B takes 9 (three separate 3-minute legs). Tests assert actual times and improvement; they cannot pass with a no-op optimizer.
- No Docker, remote routing account, email, or database credentials are needed. H2 checks application persistence behavior, not PostgreSQL migrations or production concurrency. No timing sleeps or search-order assumptions for tied routes are used.

## Before implementing tests — contract checklist

- [x] Contract and sample JSON are on `develop` (SCRUM-201, PR #40).
- [x] Interface is fixed: `RouteOptimizer.optimize(stops, school, capacity, schoolArrivalTime)` returns a `Plan`; SCRUM-202 is present.
- [x] Endpoints and status codes are in the contract (POST `/optimization`, POST `.../apply`, DELETE `.../{proposalId}`); SCRUM-203 is present.
- [x] One stop is one student, so seats used = number of stops; an infeasible route is a 201 with `feasible: false` (see the contract).
- [x] Translate existing fixture scenarios to typed test inputs; leave illustrative files intact.
- [x] Run the focused tests on Windows using the wrapper's Maven distribution; wrapper startup limitation and workaround recorded below.
- [ ] Report failures on the appropriate implementation PR; attempted reviews on #47 and #66 returned GitHub 403 `Resource not accessible by integration`. Neither review was submitted.

## Historical execution findings (2026-10-19; resolved by PR #71)

The focused run executed 32 new cases: 11 solver cases passed; 20 of 21 API cases passed.
Full Maven `verify` with Apache Maven 3.9.16 on Windows Java 21 executed 438 cases:
**436 passed, 1 failed, 0 errors, 1 skipped** (the existing live OpenRouteService test).
Verification failed at the test phase solely on the retained malformed-UUID regression; no existing test failed.
`git diff --check` passed. The literal `.\mvnw.cmd verify` command was attempted and hit the startup
limitation below; the cached distribution's `mvn.cmd -B -ntp -Dmaven.repo.local=<user-cache> verify`
performed the full lifecycle through the failing test phase.
SOL-01 through SOL-08 and OPT-01 through OPT-05 passed. OPT-06 found a genuine production defect:
an authenticated request with a malformed UUID is mapped to a 500 by
`GlobalExceptionHandler.handleUnexpected(Exception)` instead of a client input error.
Spring raises `MethodArgumentTypeMismatchException` before the optimization controller runs.
The retained `opt06MalformedUuidPathsAre400AndDoNotConsumeThePendingProposal` test checks
all three operations and checks that the pending proposal, assignments, and versions remain intact.

Reproduce after setting up the normal backend Java/Maven environment:

```powershell
cd backend
.\mvnw.cmd "-Dtest=IndependentRouteOptimizationTests#opt06MalformedUuidPathsAre400AndDoNotConsumeThePendingProposal" test
```

The three requests are `POST /api/head-of-transport/routes/not-a-uuid/optimization`,
`POST /api/head-of-transport/routes/{validRouteId}/optimization/not-a-uuid/apply`, and
`DELETE /api/head-of-transport/routes/{validRouteId}/optimization/not-a-uuid`.
They must reject invalid client input without returning a 500. No solver, controller, or exception-handler
production code was changed, and the failing test was not disabled or weakened.

Windows execution limitation: `mvnw.cmd` fails before Maven with `Cannot index into a null array`
in the wrapper's `.Target[0]` handling. Tests were run with the already-cached wrapper distribution,
Apache Maven 3.9.16, passing `-Dmaven.repo.local` with the correct user cache path. The wrapper and
environment configuration were preserved. No live OpenRouteService call is needed by the new tests.

The original submission was withheld while this production regression remained unresolved.

## Verification after merged UUID fix (2026-10-20)

Branch: `test/SCRUM-228-independent-optimizer-tests`, based on updated `develop`.
Merged PR #71 is present, including the dedicated `MethodArgumentTypeMismatchException`
handler returning a safe 400 ProblemDetail; unexpected server failures retain generic 500 handling.

- Focused run: **32 passed, 0 failed, 0 errors, 0 skipped** (11 solver and 21 endpoint cases).
- The unchanged `opt06MalformedUuidPathsAre400AndDoNotConsumeThePendingProposal` regression passes
  for propose, apply and discard, with pending proposal, route order and versions preserved.
- Full Maven `verify`: **537 cases, 536 passed, 0 failed, 0 errors, 1 skipped**, BUILD SUCCESS,
  including packaging. The skip is the existing live OpenRouteService test requiring `ORS_API_KEY`.
- SOL-01, SOL-02, SOL-03, SOL-04, SOL-05, SOL-06, SOL-07 and SOL-08: **PASS**.
- OPT-01, OPT-02, OPT-03, OPT-04, OPT-05 and OPT-06: **PASS**.
- No test assertions were weakened, removed or disabled; both restored Java files remain unchanged.
- No production code changes were needed. Final scope is the two independent test classes and this plan.
- `git diff --check` passed. Existing untracked `AGENTS.md` and stash backup are preserved.

Commands run from `backend/` with cached Apache Maven 3.9.16 and Java 21:

```powershell
& '<cached-maven>/bin/mvn.cmd' '-Dmaven.repo.local=C:/Users/User/.m2/repository' '-Dtest=IndependentRouteOptimizerTests,IndependentRouteOptimizationTests' test
& '<cached-maven>/bin/mvn.cmd' -B -ntp '-Dmaven.repo.local=C:/Users/User/.m2/repository' verify
```

CI and independent review remain release gates; local verification alone does not mark the Jira ticket Done.

## Reporting

Keep this task **In Progress**, not Done, until real JUnit assertions run against the implemented code, CI is green, and independent review is complete.
