# SCRUM-228 — Independent solver and optimization tests

Owner: Wassim Fawaz
Sprint: 2 — Integrate / Deploy
Status: **Prepared test cases, not yet executable integration tests**

## Scope and constraints

The Sprint 2 plan assigns independent tests of the route solver and optimization endpoints to Wassim (SCRUM-228). It explicitly calls out the invariant **“capacity never exceeded.”** The routing contract (SCRUM-201) and implementations (SCRUM-202 and SCRUM-203) are owned by Hashem. Their Java method signatures, exact HTTP paths, request/response JSON, status codes, and behavior on infeasible input **are not yet established here**. Do not guess those details.

These are test designs to implement as JUnit 5 tests against the agreed routing interface, with mocked travel-time providers and repositories where appropriate. Sample fixture files are *domain examples*, **not claimed to be the production API schema**.

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
| SOL-03 | Vehicle capacity 14, 15 students | No successful over-capacity route; inspect agreed failure response | Solver + endpoint |
| SOL-04 | Route with no students | Cleanly handled using agreed contract; no crash or invented stops | Solver unit |
| SOL-05 | Route with one stop | Exactly one stop; no new stop or lost assignment | Solver unit |
| SOL-06 | Stops have repeated coordinates but distinct student IDs | Each student remains assigned exactly once | Solver unit |
| SOL-07 | Travel time missing/provider failure | Use only the documented fallback or return a defined error; no silent fabrication | Solver unit |
| SOL-08 | Impossible arrival/deadline time constraints | Report infeasible route or defined failure; never claim it meets impossible times | Solver unit |
| OPT-01 | Saved order A-B-C; request proposal | Persisted order remains A-B-C until apply | Optimization service/controller |
| OPT-02 | Proposal exists; explicitly apply it | New order persists after reload; selected stop/student set unchanged | Optimization service/controller |
| OPT-03 | Proposal exists; discard it | Stored route/order unchanged | Optimization service/controller |
| OPT-04 | Same route receives a new version before applying old proposal | Follow SCRUM-201 version-conflict behavior; stale proposal must not silently overwrite newer changes | Optimization service/controller |
| OPT-05 | Unauthorized or other-school route | Deny access and do not modify data | Controller/security |
| OPT-06 | Missing or invalid route/proposal ID | Contract-defined error, no 500 or state mutation | Controller |

## Suggested JUnit implementation once contract lands

- Write `RouteOptimizerTests` with fixtures SOL-01 through SOL-08. Use a deterministic/fake travel-time dependency (not remote OpenRouteService) to isolate solver properties.
- Write `RouteOptimizationServiceTests` for OPT-01 through OPT-04 with an in-memory or mocked route store and version checks.
- Write `RouteOptimizationControllerTests` for OPT-05 through OPT-06 using the team's existing security/test conventions. No Docker is needed for mocked controller/unit tests.
- Keep real PostgreSQL end-to-end tests separate, tagged appropriately, for CI/staging where backend resources are available.
- Add tests under the matching feature package in `backend/src/test/java/com/wassel/backend/...` once the owner establishes its exact package names; **do not invent production class names**.

## Before implementing tests — contract checklist

- [ ] Obtain `docs/contracts/routing.md` and sample JSON (SCRUM-201).
- [ ] Confirm optimizer Java interface, package names and dependencies (SCRUM-202).
- [ ] Confirm propose/apply/discard endpoints, status codes, route versioning rules (SCRUM-203).
- [ ] Confirm seat-count semantics, grouping at pickup points, and what happens to infeasible routes.
- [ ] Convert examples in `fixtures/` to the official DTO schema.
- [ ] Run `./mvnw.cmd -Dtest=<TestClass> test` on Windows for actual implemented tests.
- [ ] Report failures on the appropriate implementation PR; do not modify Hashem's solver to make tests pass.

## Reporting

Keep this task **In Progress**, not Done, until real JUnit assertions run against the implemented code, CI is green, and independent review is complete.
