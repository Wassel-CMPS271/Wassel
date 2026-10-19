# SCRUM-205: independent tests for routes, stops and arrival times

Tester: Hashem Awad. Code under test: Moustafa's SCRUM-208, 209, 210 and 212 (all merged).
Written from `docs/contracts/routing.md` and the ticket, not from the implementation.

## What was added

One class, `backend/src/test/java/com/wassel/backend/routes/controller/RouteContractTests.java`
(22 tests, `@SpringBootTest` + MockMvc on H2, real repositories and services, no mocks).
It only covers behaviour `RouteControllerTests` does not already check. The `test` profile blanks
the road provider key, so every leg is the contract's straight-line fallback (30 km/h, each leg
rounded up); expected times are worked out by hand from the contract sample.

## Result

| Run | Outcome |
|---|---|
| `RouteContractTests` against the current code | 22 passed, 0 failed |
| Full `mvn -B clean verify` (before A and B were added) | 428 run, 0 failed, 1 skipped (live OpenRouteService test, needs a key) |

The 22 passing tests found no defect. Further tests reproduced bugs A and B and F (red), and their
fixes are in this PR with those tests (green). E was fixed after a real-PostgreSQL run. **Limit of all of this:** the tests run on H2,
so they say nothing about concurrency or PostgreSQL transaction behaviour (finding E was found only
by running against a real PostgreSQL).

## Do the tests fail when the feature breaks?

Each test was checked by temporarily breaking one production line in a scratch copy of `backend/`
(nothing was changed in the repository). Every mutation turned exactly one test red:

| Production line broken | Test that went red |
|---|---|
| Driver conflict check skipped on edit | `editingToADriverAlreadyOnAnotherRouteNamesThatRoute` |
| `seatsLeft` clamped at 0 | `aRouteOverCapacityShowsNegativeSeatsLeftAndRefusesAnotherStudent` |
| Route lookup no longer scoped by school | `editingWithUnknownOrOtherSchoolReferencesIsNotFoundAndChangesNothing` |
| Remove requires an active student | `aStudentMadeInactiveAfterBeingAssignedCanStillBeRemoved` |
| Empty reorder list accepted | `aNullOrEmptyOrderIsRejectedAndLeavesTheRouteAsItWas` |
| Assign writes the old `students.route` text | `assigningAndRemovingNeverWriteTheOldRouteTextColumn` |
| 06:00 first pickup treated as too early | `aFirstPickupExactlyAtSixIsAllowedAndOneMinuteEarlierGivesNoTimes` |
| Pre-midnight start not detected | `aScheduleThatWouldStartBeforeMidnightGivesNoTimesNotAnError` |
| Parent role allowed on the controller | `everyRouteEndpointRefusesOtherRolesAndAnonymousCallers` |

## What each test guarantees

**SCRUM-208 (route API gaps)**
1. Editing to a driver already on another route is a 409 on `errors.driverId`, naming that route.
2. Editing to an inactive vehicle is a 409 on `errors.vehicleId`.
3. Editing with an unknown or other-school vehicle or driver, or another school's route, is a 404 and changes nothing.
4. Editing with `{}` or a blank name is a 400 per field.
5. Deleting a route frees its vehicle and driver for a new route.
6. Swapping a route's vehicle frees the old one.
7. All 8 endpoints answer 403 to admin, driver and parent, and 401 to anonymous callers.

**SCRUM-209 (assign and remove)**
8. A full route plus an inactive new student reports capacity, not the student error.
9. An unknown route is a 404 before the student is looked at.
10. A student refused by a full route stays on their old route.
11. A moved student becomes the new route's last stop.
12. A student made inactive after assignment can still be removed.
13. Another school cannot add to or remove from this school's route.
14. Removing a middle stop keeps the order (positions read 1..n) and the next student goes last.
15. Assign and remove never write the old `students.route` text.
16. A missing or malformed `studentId` is a 400.
17. After capacity is lowered, `seatsLeft` is negative on GET and list, and adding is a 409 with count and capacity.

**SCRUM-210 (reorder)**
18. A null, missing or empty `studentIds` on a route with stops is a 400 under `errors.studentIds` and leaves the order alone.

**SCRUM-212 (arrival times)**
19. A first pickup at exactly 06:00 shows times; one minute earlier shows none.
20. A schedule that would start before midnight gives a 200 with no times, not an error.
21. An unpinned middle stop is skipped by the legs around it.
22. Removing a stop recalculates the remaining times in the response.

## Not tested, on purpose

- Schedule arithmetic and leg direction: `RouteTimingsTests` (SCRUM-202, same author as the optimizer).
- The optimizer, propose and apply (SCRUM-203): not independent.
- Direct `StudentService` calls: their other-school paths cannot be reached through the API.
- Stored `stop_position` values: the backend notes define the API's 1..n as the contract.

## Findings (reported to the owner, not fixed in Moustafa's code)

Council verdict (2026-10-19), after four independent voices: A and B are defects, C is a contract
decision, D and G are one locking ticket, E needs a fix, F is a separate small PR.

| # | Finding | Status and evidence |
|---|---|---|
| A | Re-adding a student already on a route moves them to the last stop and shifts every arrival time. Expected: re-adding changes nothing. | **Confirmed and fixed in this PR:** `reAddingAStudentAlreadyOnTheRouteChangesNothing` was red (`stops[1].studentId` was the old last student), now green. `StudentService.assignToRoute` returns early when the student is already on that route (+3 lines). |
| B | Renaming a route returns 409 `errors.vehicleId` when its vehicle was deactivated after assignment, for a field the user did not touch. | **Confirmed and fixed in this PR:** `renamingARouteWhoseVehicleWasDeactivatedLaterStillWorks` was red (expected 200, was 409), now green; the same bug for a deactivated driver (`renamingARouteWhoseDriverWasDeactivatedLaterStillWorks`) is covered too. `RouteService.editRoute` re-checks only a vehicle or driver that is being changed. Contract updated with one sentence for A and one for B. |
| C | Editing a route onto a vehicle smaller than its students is allowed (negative `seatsLeft`). | **Contract decision, no test.** The contract already allows negative `seatsLeft` (the vehicles endpoint can lower capacity), so blocking only `editRoute` would be inconsistent. Proposed contract sentence: "Editing a route onto a smaller vehicle is allowed; `seatsLeft` goes negative and the screen warns." |
| D | Two concurrent adds to the last seat can both pass (check then write, no lock). | Reported, no test (flaky on H2). One ticket with G: a write lock on the route row taken by every stop-changing method. It also closes the apply race the code already documents. |
| E | After a unique-constraint race, `createRoute` and `editRoute` re-query in the same transaction. | **Confirmed on real PostgreSQL 16** (throwaway container, temporary test, since deleted): two simultaneous creates with the same vehicle gave `[201, 500]` in 30 of 30 rounds, never `[201, 409]`. The app log shows `duplicate key value violates unique constraint`, then `current transaction is aborted, commands ignored until end of transaction block`, then `Unhandled exception`. Every race on a duplicate vehicle or driver is a 500. **Fixed in this PR** (`RouteService`, +16/-7): no query after the violation; the failed constraint's name picks `vehicleId` or `driverId`. Re-run on the same PostgreSQL: 30 of 30 races now `[201, 409]` with the right field. The race message no longer names the other route. No permanent test is possible on H2, which does not abort the transaction. |
| F | `GET /routes/not-a-uuid` answered 500: the catch-all `Exception` handler swallowed Spring's 400. Affects every endpoint. | **Fixed in this PR** (9-line handler in `common` plus `MalformedPathVariableTests`, red 500 then green 400). It is shared code, so the `common` owners should be tagged on the PR. |
| G | `ORDER BY stop_position` has no tiebreaker, so tied positions give an unstable order. | Only reachable through the race in D. Goes away with the D lock. |

## Follow-ups suggested

- A PostgreSQL test profile (Testcontainers): H2 hides finding E and anything else database-specific.
- A ticket for D and G (route-row lock) and one for E, both to Moustafa.
- A one-sentence contract change for A, B and C, tagging the owners.

## Review criterion

The "tester reviews the author's pull request" criterion: Hashem approved #54 (SCRUM-209), #55 (SCRUM-210) and #60 (SCRUM-212), and commented on #48 (SCRUM-208). Jira still shows SCRUM-208 as To Do and SCRUM-212 as In Review although both are merged.
