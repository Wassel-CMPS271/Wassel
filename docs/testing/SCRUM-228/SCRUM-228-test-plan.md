# SCRUM-228 — Independent solver and optimization tests

Owner: Wassim Fawaz
Sprint: 2 — Integrate / Deploy
Status: **Prepared test cases, not yet executable integration tests**

## Scope and constraints

The Sprint 2 plan assigns independent tests of the route solver and optimization endpoints to Wassim (SCRUM-228). It explicitly calls out the invariant **“capacity never exceeded.”** The routing contract (SCRUM-201) is merged: `docs/contracts/routing.md`, the samples in `docs/contracts/samples/routing/`, and the `RouteOptimizer` and `TravelTimes` interfaces in `com.wassel.backend.routing.service`. The solver (SCRUM-202) and the propose / apply / discard endpoints (SCRUM-203) are not implemented yet, so the tests below cannot run against real code until they land. Write expectations from the contract, not from the implementation.

These are test designs to implement as JUnit 5 tests against the agreed routing interface, with mocked travel-time providers and repositories where appropriate. The fixture files in `fixtures/` are *domain examples*, **not the production API schema**; for payload-shaped assertions use the contract's `proposal.json` and `proposal-infeasible.json`.

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
| SOL-04 | Route with no students | The caller rejects it before calling the optimizer (`optimize` requires non-empty stops): the endpoint answers 409 with a `detail`; no crash, no invented stops | Solver unit |
| SOL-05 | Route with one stop | Exactly one stop; no new stop or lost assignment | Solver unit |
| SOL-06 | Stops have repeated coordinates but distinct student IDs | Each student remains assigned exactly once | Solver unit |
| SOL-07 | Travel time missing/provider failure | Use only the documented fallback or return a defined error; no silent fabrication | Solver unit |
| SOL-08 | Impossible arrival/deadline time constraints | Not feasible with `ARRIVAL_TIME_UNREACHABLE`; never claims it meets impossible times. The contract notes a solver that can always leave earlier will not produce this until SCRUM-202 defines a latest-departure rule | Solver unit |
| OPT-01 | Saved order A-B-C; request proposal | Persisted order remains A-B-C until apply | Optimization service/controller |
| OPT-02 | Proposal exists; explicitly apply it | New order persists after reload; selected stop/student set unchanged | Optimization service/controller |
| OPT-03 | Proposal exists; discard it | Stored route/order unchanged | Optimization service/controller |
| OPT-04 | Same route receives a new version before applying old proposal | Apply answers 409 when the route's stops or their order changed since the proposal; a discarded, replaced or unknown proposal answers 404 | Optimization service/controller |
| OPT-05 | Unauthorized or other-school route | 404 (another school's route is indistinguishable from a missing one); no data modified | Controller/security |
| OPT-06 | Missing or invalid route/proposal ID | 404 for an unknown route or proposal; 409 for a route with no stops, no school arrival time, or stops without a pin; no 500, no state change | Controller |

## Suggested JUnit implementation once contract lands

- Write `RouteOptimizerTests` with fixtures SOL-01 through SOL-08. Use a deterministic/fake travel-time dependency (not remote OpenRouteService) to isolate solver properties.
- Write `RouteOptimizationServiceTests` for OPT-01 through OPT-04 with an in-memory or mocked route store and version checks.
- Write `RouteOptimizationControllerTests` for OPT-05 through OPT-06 using the team's existing security/test conventions. No Docker is needed for mocked controller/unit tests.
- Keep real PostgreSQL end-to-end tests separate, tagged appropriately, for CI/staging where backend resources are available.
- Add tests under the matching feature package in `backend/src/test/java/com/wassel/backend/...` once the owner establishes its exact package names; **do not invent production class names**.

## Before implementing tests — contract checklist

- [x] Contract and sample JSON are on `develop` (SCRUM-201, PR #40).
- [x] Interface is fixed: `RouteOptimizer.optimize(stops, school, capacity, schoolArrivalTime)` returns a `Plan`. [ ] The implementation waits for SCRUM-202.
- [x] Endpoints and status codes are in the contract (POST `/optimization`, POST `.../apply`, DELETE `.../{proposalId}`). [ ] The implementation waits for SCRUM-203.
- [x] One stop is one student, so seats used = number of stops; an infeasible route is a 201 with `feasible: false` (see the contract).
- [ ] Convert examples in `fixtures/` to the official DTO schema.
- [ ] Run `./mvnw.cmd -Dtest=<TestClass> test` on Windows for actual implemented tests.
- [ ] Report failures on the appropriate implementation PR; do not modify Hashem's solver to make tests pass.

## Reporting

Keep this task **In Progress**, not Done, until real JUnit assertions run against the implemented code, CI is green, and independent review is complete.
