# SCRUM-207: generate all routes, test report

Written by the author (Hashem). SCRUM-216 (Moustafa) challenges these tests with independent ones.

## What was built

- `POST /api/head-of-transport/routes/generation` proposes routes for every vehicle that can be used, saves the proposal and changes nothing else. `POST .../generation/{proposalId}/apply` makes it the school's routes in one transaction. `DELETE .../generation/{proposalId}` drops it. Shapes and rules are in `docs/contracts/routing.md` and the two `fleet-proposal*.json` samples.
- `RouteGenerationService` and `RouteGenerationController` in the `routes` module; migration `V5__fleet_proposals.sql`; `FleetProposal` and `FleetProposalRoute` (one proposal per school); `StudentService.placeOnRoutes`; `NO_PIN` in `RouteOptimizer.Code`. `RouteService` and `RouteController` are untouched.
- Decisions (council, 2026-10-19): a vehicle with a route updates it and keeps its name and driver; otherwise a new route is created with the vehicle's assigned driver; routes of vehicles that are not planned are left alone; only ACTIVE drivers count; a fingerprint of the planner's inputs makes apply answer 409 when the data changed; no undo (apply logs the previous assignment); a second apply of the same proposal is a 404.

## Tests first

`RouteGenerationControllerTests` was written before any production code and run: it failed to compile because `FleetProposalRoute`, `FleetProposalRepository` and `FleetProposalRouteRepository` did not exist (the intended compile-time RED). After the implementation the same target ran GREEN: 26 tests, 0 failures. They use the real solver and real repositories on H2 (PostgreSQL mode), with no mocks of our own code, and assert rules, not exact splits, because the solver's search is time-limited.

The review (2026-10-19) strengthened them to 34. Assertions that could pass vacuously now check that everyone is placed, that capacity holds in the database after apply, the exact 409 text, the new route's name and driver, and that a route's own driver is kept when it differs from the vehicle's assigned driver. New tests cover a deactivated student, a deactivated driver and a deleted route (all refused), a rename or address edit (not refused), both schools keeping their own pending proposal, an empty generate dropping the pending one, discard with students already on routes, and a failed apply restoring an existing route's students and positions. The two failure-path tests went RED first (404 where 409 is expected) and GREEN after the fix.

## What each test guarantees

| Ticket criterion | Tests |
|---|---|
| 207: generating returns the proposal and changes nothing | `generatingProposesRoutesAndChangesNothing`, `generatingAgainReplacesThePendingProposal`, `withNothingToPlaceTheIdIsNullAndNothingIsSaved` |
| 207 / 216: every active pinned student is on one route or reported; no vehicle over capacity | `everyActivePinnedStudentIsOnExactlyOneRouteOrUnplacedAndNoVehicleIsOverCapacity`, `anActiveStudentWithoutAPinIsUnplacedWithNoPinAndAnInactiveOneIsIgnored` |
| 216: not enough seats is a clear report, not a crash | `notEnoughSeatsReportsTheRestAsCapacityExceededInsteadOfFailing` |
| 207: apply creates or updates routes, assigns students, saves the order, in one transaction | `applyingCreatesTheRoutesAssignsTheStudentsAndSavesTheStopOrder`, `aVehicleThatAlreadyHasARouteUpdatesItAndKeepsItsNameAndDriver`, `aRouteOfAVehicleThatIsNotPlannedIsLeftAloneButItsStudentsCanBeMovedOffIt`, `aFailedApplyWritesNothingAtAll` |
| 216: applying twice does not duplicate routes | `applyingTheSameProposalTwiceIsNotFoundAndGeneratingAgainNeverDuplicatesARoute` |
| 207 / 216: discarding changes nothing | `discardingDropsTheProposalAndLeavesEverythingElseAlone` |
| Apply is refused (409, nothing written, proposal kept) when the data moved | `applyingAfterAStudentWasAddedIsRefused`, `...APinWasMovedIsRefused`, `...ACapacityChangedIsRefused`, `...TheSchoolsArrivalTimeChangedIsRefused`, `...ARouteWasCreatedByHandIsRefused`, `...ARouteWasReorderedByHandIsRefused` |
| Vehicles without a usable driver are excluded, not planned | `vehiclesNoActiveDriverCanDriveAreExcludedAndNeverPlanned` |
| Generating needs the school's arrival time | `generatingBeforeTheSchoolsArrivalTimeIsSetIsAConflict` |
| 207: only the caller's school is affected | `eachSchoolOnlyEverSeesAndChangesItsOwnData`, `anotherSchoolsVehiclesAndStudentsNeverEnterThePlan` |
| Roles and input | `onlyTheHeadOfTransportationCanUseIt` (403 for admin, driver and parent; 401 anonymous), `aMalformedProposalIdIsABadRequest` |
| Contract, samples and code agree | `theResponseHasTheKeysOfTheContractSamples`, `theEmptyResponseHasTheSampleShapeAndWording` |

## Runs

| Run | Result |
|---|---|
| `sh ./mvnw -B clean verify` (whole backend, after the review fixes) | 472 run, 0 failed, 1 skipped, BUILD SUCCESS |
| The 34 tests on a throwaway PostgreSQL 16 (Flyway V1 to V5 applied to an empty database, `ddl-auto=validate`, same test class via `-Dspring.datasource.*`) | 34 run, 0 failed. Hibernate accepted the V5 tables against the entities |
| Coverage, JaCoCo 0.8.14 run from the command line (`clean org.jacoco:jacoco-maven-plugin:0.8.14:prepare-agent test ...:report`; the pom has no plugin) | `RouteGenerationService` 95% of lines, 61 of 64 branches; `StudentService` 96% of lines |
| Timing through the HTTP path, H2, straight-line times, 150 students on 10 vehicles of 16 seats | generate 13.5 s (10 routes, none unplaced), apply 0.26 s. The scratch test was deleted afterwards |

## End to end by hand (2026-10-19)

The real app (`local` profile, port 8090) on a throwaway PostgreSQL 16 on port 5440, demo data (10 pinned students, 3 vehicles with active drivers, arrival 08:00), the real two-step sign-in (password, then the code from the log), road key blank so no quota was spent. Every case was checked against the database, not only the responses.

| Case | Result |
|---|---|
| Generate, review | 201, 2 routes with stops and arrival times, nothing unplaced; no route or student changed in the database |
| Discard; discard again; apply the discarded one | 204 with routes and students identical before and after; 404; 404 |
| Apply; apply the same id again | 200 with the routes list; 404; 2 routes, invariants clean |
| Generate and apply with routes already there | existing routes updated, not duplicated (still 2) |
| Stale: a student added; a pin moved; a route reordered by hand | 409 "The students changed…", 409 "The students changed…", 409 "The routes changed…"; nothing written |
| A rename only | 200, the new name kept |
| Forced failure on the new (last) route: its driver set to the driver of an existing route in the stored plan | 409, database byte-for-byte as before (routes, every student's route and position, proposal rows) |
| Forced failure late, inside the student placement (an unknown student added to the stored order), after the apply had started writing | rolled back exactly; answered 404 "Student not found" before the fix, 409 after |
| 8 parallel applies of one set, 3 rounds | 1 × 200 and 7 × 404 each round, no 500 |
| 8 parallel generates, 3 rounds | 1 × 201 and 7 × 409 each round, one proposal, no orphaned rows |
| Apply racing a generate, 15 rounds plus 15 staggered | 200/201 or 404/201, no 500. The lock-order deadlock was not hit by timing but was proven by replaying both transactions in two PostgreSQL sessions (`deadlock detected`); fixed, and the replay then waits instead |
| Fleet apply racing a single-route (SCRUM-203) apply on the same route, 12 + 8 adversarial rounds (capacity lowered so the plan must move students off that route) | 200/409 (staleness caught) or 200/200 (one overwrote the other, the documented limit); never a half-applied state: no route over capacity, positions 1..n, no dangling or inactive riders |
| Roles | anonymous 401; admin, driver, parent 403; another school's head of transportation 404 on our proposal, and its own generate left ours pending |
| Invariants after every step | no route over capacity, positions exactly 1..n, no student on a missing route, no inactive rider; a student has one `route_id`, so never two routes |

Found by the review and fixed: the deadlock above; a student gone between the comparison and the placement answering 404 instead of the stale 409; both constraint catches dropping the cause (now logged). Also found: a planned vehicle that the solver gave no students was left out of the proposal, so its route was not shown and the students moved off it left without a `leaving` entry (reproduced: "Nadia run" lost its only student, then a 7-student route was emptied, both silently in the preview). Fixed with a contract change: such a route is now listed with no stops and its students in `leaving`, and apply empties it. Test: `aPlannedVehicleThatGetsNoStudentsIsListedWithNoStopsAndApplyEmptiesItsRoute` (RED: "the emptied route is in the proposal", then GREEN). A route of a vehicle that is not planned is still not listed when a student moves off it; that is now a stated known limit.

## Not covered

- **Concurrency is not automated.** It was exercised by hand (above), not by a test.
- **A manual edit committing between apply's comparison and its writes is overwritten**, the limit SCRUM-203 documents. The races above never left a half-applied state, but one apply can silently win over the other.
- **Not run against the real OpenRouteService.** Tests use straight-line times (the test profile blanks the key). Each real generate can spend about 1 + one request per route, and the key appears to allow about 50 a day (unconfirmed).
- **The deployed proxy's timeout was not checked** against a 13 to 20 second request.
- A pending single-route proposal is not cleared by apply; a stale one answers 409 on its own, as before. Not tested.
- Students on a route that is left alone lose a seat there only when moved onto a planned route; that route's own `leaving` list is not shown, because the route is not in the proposal.
