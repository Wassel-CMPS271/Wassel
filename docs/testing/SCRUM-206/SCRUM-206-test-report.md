# SCRUM-206: fleet planner tests and evidence

## What was added

- `routing.service.FleetPlanner`: splits students across vehicles and orders each route. One OR-Tools model over one matrix assigns students within each vehicle's seats and a first pickup at or after 06:00; each route is then ordered again by the existing `RouteOptimizer`. It only proposes, nothing is saved (that is SCRUM-207).
- `FleetPlannerTests`: 18 tests on the real solver and the straight-line stand-in. The first 14 were written before the class existed; the review added 4 (random schools, brute force, 06:00 exactly, negative capacity) and tightened 3.
- The routing contract (`docs/contracts/routing.md`) and `backend/CLAUDE.md` describe the planner, its rules and its limits.

The search stops at a time limit, so answers can differ between runs. The tests assert the rules every answer keeps, never one exact split. SCRUM-216's tests should do the same.

## Result

| Run | Outcome |
|---|---|
| `mvnw test -Dtest=FleetPlannerTests` before `FleetPlanner` existed (RED) | compile failure, only `FleetPlanner` missing |
| Same, after (GREEN) | 14 passed, 0 failed |
| Same, after the review | 18 passed, 0 failed (30 s) |
| JaCoCo on `FleetPlanner` (from the command line; the pom has no JaCoCo) | 97% lines (77/79), 94% branches (32/34). The 2 lines missed are the throw for a solver that returns nothing, which the model cannot reach (leaving everyone out is always a solution) |
| Full `mvnw -B clean verify`, as CI runs it | 424 run, 0 failed, 1 skipped (live OpenRouteService test, needs a key); jar builds |

## Do the tests fail when the planner breaks?

Each line was broken on its own, the tests run from a clean build, then the line restored.

| Production line broken | Tests that went red |
|---|---|
| No driving-time limit per vehicle (06:00 ignored) | `aStudentTooFarToReachInTimeIsReportedAndTheOthersArePlaced`, `aStudentWhoFitsNoRouteInTimeIsUnreachableNotCapacity` |
| No seat limit per vehicle | `everyStudentIsPlacedWhenThereAreEnoughSeats`, `aFullFleetIsUsedToTheLastSeat`, `moreStudentsThanSeatsFillsTheFleetAndReportsTheRestAsCapacity`, `sixtyStudentsArePlannedWithinTheTimeBudget` |

## Properties checked on many inputs (review, 2026-10-19)

A one-off harness on the real solver and the straight-line stand-in; the brute-force and random checks were then kept, smaller, in `FleetPlannerTests`.

| Property | Inputs | Result |
|---|---|---|
| Every rule: each student once or reported, seats, 06:00, arrival-time rule, the reason code, and nobody left out while an unused vehicle could take them alone | 40 random schools: up to 30 students, 0 to 4 vehicles of 0 to 12 seats, up to 33 km across, arrivals 05:50 to 08:00 | all held; 356 students reported unplaced across them |
| Optimal on small inputs: as many students placed as possible, then the least total driving | 62 random schools of up to 6 students and 3 vehicles, against trying every assignment and every order | 62 of 62 equal to the best |
| Never worse than a simple baseline (sweep by angle around the school, fill vehicles in turn, farthest pickup first) | 25 random schools of up to 40 students | never worse; 213 minutes of driving in total against the sweep's 345 |
| Time | demo school (10 students, vehicles of 14, 14, 20) | 1.0 s, 2 routes, all placed |
| | 150 students, 10 vehicles, about 13 km across | 12.5 s, all placed (within the documented 5 s + 2 s a route) |
| | 300 students, 20 vehicles | 20.1 s, all placed |

## Integration (no endpoint yet; SCRUM-207 adds it)

The real application context (local profile) on a throwaway PostgreSQL 16 at `127.0.0.1:5433`: Flyway applied V1 to V4 to an empty database, the demo seeder filled the school, and the `FleetPlanner` bean (wired with the `@Primary` `OpenRouteServiceTravelTimes`, no key so straight-line) planned the seeded data gathered the way SCRUM-207 will (active pinned students, active vehicles with a driver): 10 students on 2 of 3 vehicles, none unplaced, 1.7 s. The check was not kept: it needs a running database.

## What each test guarantees

Every test that plans runs the same rule check: each student given is on exactly one route or unplaced; each route is on a given vehicle, at most one per vehicle, not empty, feasible, within its seats, with no first pickup before 06:00 and arrival times equal to `RouteTimings`; every unplaced student has `CAPACITY_EXCEEDED` when there are more students than seats and `ARRIVAL_TIME_UNREACHABLE` otherwise; and nobody is left out while an unused vehicle could take them alone.

| Test | Guarantee |
|---|---|
| `everyStudentIsPlacedWhenThereAreEnoughSeats` | 40 students, 48 seats: nobody left out |
| `aFullFleetIsUsedToTheLastSeat` | 48 students, 48 seats: all placed |
| `moreStudentsThanSeatsFillsTheFleetAndReportsTheRestAsCapacity` | 52 students, 48 seats: 48 placed, 4 `CAPACITY_EXCEEDED`, message gives both counts |
| `aStudentTooFarToReachInTimeIsReportedAndTheOthersArePlaced` | a student 120 minutes away (90 allowed) is `ARRIVAL_TIME_UNREACHABLE`, the rest are placed |
| `studentsAreSplitWhenOneRouteWouldStartTooEarly` | two far students go on two vehicles when one route would start before 06:00 |
| `aStudentWhoFitsNoRouteInTimeIsUnreachableNotCapacity` | with one vehicle and enough seats, the one left out is `ARRIVAL_TIME_UNREACHABLE`, not capacity |
| `twoNeighbourhoodsGoOnTwoVehicles` | two clusters 10 km apart make two routes, each in one neighbourhood |
| `spareVehiclesGetNoRoute` | both students placed and a vehicle with no students gets no route |
| `studentsAtTheSameAddressAreBothPlaced` | siblings at one pin are two stops |
| `noStudentsGiveNoRoutes` | empty input, empty answer |
| `noVehiclesReportEveryStudentAsCapacity` | no vehicles: everyone `CAPACITY_EXCEEDED` |
| `aSchoolArrivalBeforeTheEarliestPickupPlacesNobody` | arrival 05:30: nobody placed, all `ARRIVAL_TIME_UNREACHABLE` |
| `aFirstPickupExactlyAtSixIsAllowed` | arrival 06:00: a student at the school's pin rides (first pickup exactly 06:00), one a kilometre away does not |
| `aRouteThatIsTooLateOnItsOwnTimesIsReportedNotKept` | a route that passes on the fleet matrix but fails 06:00 on its own (slower) matrix is dropped and exactly its students reported. Uses a travel-time stand-in that is slower for small point sets, like the road client above its 59-point limit |
| `aNegativeCapacityIsRejected` | a vehicle with negative seats is refused at the input |
| `sixtyStudentsArePlannedWithinTheTimeBudget` | 60 students on 4 vehicles plan within the documented budget (5 s + 2 s a route), all placed |
| `randomSchoolsKeepEveryRule` | 8 random schools (empty and zero-seat vehicles, arrivals before 06:00) keep every rule |
| `smallSchoolsMatchTheBestPossibleAnswer` | 12 random small schools: the most students placed and the least total driving, as brute force finds |

## Not tested, on purpose

- **Which students are left out when seats run short.** The solver leaves out whoever costs the most driving; the tests check the count and the reason, because the exact students can change between runs.
- **Against the real OpenRouteService.** The planner only uses `TravelTimes`, whose road client has its own tests. A manual run with a key is still to do (needs `ORS_API_KEY`), so the free quota is not spent in CI.
- **A solver that returns nothing.** It throws rather than report everyone unreachable; the model always has a solution (everyone left out), so no input reaches it.
- **Callers.** Choosing students (active, pinned) and vehicles (active, with a driver) and saving the result are SCRUM-207.
