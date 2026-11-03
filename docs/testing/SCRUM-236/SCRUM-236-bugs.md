# SCRUM-236: bugs found in Moustafa's work

Found while testing SCRUM-238 and SCRUM-241 for SCRUM-236 (2026-11-02). BUG-1 and BUG-2 are races that need two requests at the same instant, so the story's single-request tests pass. Neither test class runs in CI yet, because both fail on the code as it is; each carries a switch that turns it on (see "Repro" below), to be removed when the bug is fixed.

Not fixed here, as agreed: the tester raises failing tests on the author's PR and does not change feature code.

| | Story | Where | What | Raise it on |
|---|---|---|---|---|
| BUG-1 | SCRUM-238 absences (merged, PR #97) | `AbsenceService.reportAbsence` | Two reports of one child at the same moment: one of them gets **HTTP 500** in about half of the tries | a bug ticket against SCRUM-238, or a comment on the merged PR #97 |
| BUG-2 | SCRUM-241 seats (PR #107, open) | `VehicleService.setCapacity`, `RouteService.editRoute`, `RouteService.addStudent` | A seat reduction (or a smaller vehicle) at the same moment as an added student leaves the route **overfull**, `seatsLeft: -1`, in every try | PR #107 |

Both were run against PostgreSQL 16, once through MockMvc on the Testcontainers database and once by hand over real HTTP against the packaged jar (`develop` + #107, port 8090, PostgreSQL on 5441).

---

## BUG-1: two simultaneous absence reports can answer 500

**Severity: Important.** No data is damaged (exactly one absence is stored in every try), but a parent whose phone sends the request twice, or who taps twice, can be shown a server error for a report that actually went through. The contract promises that a repeated report is harmless.

**Where.** `backend/src/main/java/com/wassel/backend/absences/service/AbsenceService.java:107`, the `saveAndFlush` inside `reportAbsence`. The method catches only `DataIntegrityViolationException` (line 108) and turns it into the plain 409 "Another absence ... was just reported ... Try again".

**What happens.** When two transactions insert overlapping ranges for one student at once, PostgreSQL does not always report an exclusion-constraint violation to the second one: it can find a **deadlock** between the two inserts and abort one of them (`ERROR: deadlock detected`, SQLSTATE 40P01). Spring translates that to `CannotAcquireLockException` (a `ConcurrencyFailureException`), which `reportAbsence` does not catch and `GlobalExceptionHandler` has no handler for, so it is logged as `Unhandled exception` (ERROR, full stack) and the client gets 500.

```
org.springframework.dao.CannotAcquireLockException
  at AbsenceService.reportAbsence(AbsenceService.java:107)
Caused by: org.hibernate.exception.LockAcquisitionException: could not execute statement [ERROR: deadlock detected
Caused by: org.postgresql.util.PSQLException: ERROR: deadlock detected
```

**Repro (automated, one command, needs Docker):**

```bash
cd backend
sh ./mvnw test -Dtest=AbsenceRaceCriteriaTests
```

`AbsenceRaceCriteriaTests` sends two requests at the same instant (a barrier releases both threads), 25 rounds, once identical and once overlapping. It fails with, for example, `17 of 25 rounds wrong: [2027-01-11 [201, 500]: [a request answered 5xx ...` (identical reports) and `13 of 25 rounds wrong` (overlapping). The first rounds in a fresh JVM may pass, because a cold connection pool serialises the two requests, so keep the 25 rounds.

**Repro (by hand, real HTTP).** Needs a signed-in parent with a linked child; any session works. Fire the same request twice in parallel, with a fresh date each time:

```bash
D=2027-01-04   # change per try; must be today or later
for i in 1 2; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/parent/children/$CHILD/absences" \
    -H 'Content-Type: application/json' -b "wassel_token=$TOKEN" -d "{\"fromDate\":\"$D\"}" &
done; wait
```

Over 25 tries on the packaged jar: identical reports gave `201 + 500` in 15 and `201 + 409` in 10; overlapping reports (`D..D+1` against `D+1..D+2`) gave `201 + 500` in 17 and `201 + 409` in 8. In every try exactly one row was stored (`select count(*) from absences ...`). `docs/testing/SCRUM-236/handrun_236.py` is the script that produced these numbers.

**Expected.** Never 5xx. One request creates the absence (201) and the other answers 409 "try again" (what the code already does for a plain constraint violation), or 200 for an exact repeat.

**Fix direction (not applied).**
- Smallest: catch `ConcurrencyFailureException` (the parent of `CannotAcquireLockException`) next to `DataIntegrityViolationException` in `reportAbsence` and throw the same `AbsenceOverlapException`. PostgreSQL has already aborted the transaction, so as the existing comment says, nothing may query before the throw.
- Or avoid the deadlock: take a per-child lock before the overlap check (`select ... from students where id = ? for update`, or `pg_advisory_xact_lock(hashtext(studentId))`), so concurrent reports for one child run one after the other, and the second sees the first one's row and answers 200/409 from `resolveOverlap` (no retry needed).

**A decision for the contract, not a bug in the tests.** `docs/contracts/runs.md` says an exact repeat answers 200 "so a POST retried after a lost answer is harmless". When the two requests really race, the loser gets 409 "try again" (documented in `backend/CLAUDE.md` as intended). The lock option above would turn that into the contract's 200. The tests accept 200 or 409 for the loser and only fail on 5xx, on more than one 201, and on more than one stored row.

**Paste-ready comment.**

> **Bug (SCRUM-238, found by the SCRUM-236 tests):** two reports for the same child at the same instant can answer **500**. PostgreSQL can resolve the clash between the two inserts as a deadlock (`40P01`), Spring throws `CannotAcquireLockException`, and `AbsenceService.reportAbsence` (line 107) only catches `DataIntegrityViolationException`, so it falls to `GlobalExceptionHandler` as an unhandled exception. 15 of 25 tries for two identical reports, 17 of 25 for overlapping ones. Exactly one row is stored every time, so only the answer is wrong. Repro: `sh ./mvnw test -Dtest=AbsenceRaceCriteriaTests`. Suggested: also catch `ConcurrencyFailureException` and throw the same `AbsenceOverlapException`, or lock the child before the overlap check. Please decide whether the loser of an exact-repeat race should be 409 (as now) or the contract's 200.

---

## BUG-2: a seat reduction racing an added student leaves the route overfull

**Severity: Important.** It breaks the SCRUM-241 acceptance criterion "seats left on a route can never be negative". The case is two head-of-transportation clicks within the same moment, rare in real use, but the rule is stated as absolute and the screen shows the negative number.

**Where.** The new check in `VehicleService.setCapacity` (`currentCount > request.capacity()`, `VehicleService.java:73-77`, on PR #107), the matching check in `RouteService.editRoute` (`RouteService.java:214`), and the existing check in `RouteService.addStudent` (`currentCount >= vehicle.capacity()`, line 258).

**What happens.** Each of them reads the other side's value, compares, and writes its own row, in separate READ COMMITTED transactions with no lock in common. `setCapacity` writes the `vehicles` row, `addStudent` writes the `students` row (`route_id`). Neither write blocks or conflicts with the other, so each check sees the state from before the other commits:

1. `addStudent` reads 7 students and 8 seats, passes.
2. `setCapacity(7)` reads 7 students, passes.
3. Both commit: 8 students on 7 seats.

The same happens when `editRoute` puts a smaller vehicle on the route at the same time as an added student. Sent one after the other the rule always holds (the second request gets 409; checked 5 of 5 each way), so the single-request tests, including Moustafa's, pass.

**Repro (automated, needs Docker; run on a branch that has #107's code):**

```bash
cd backend
sh ./mvnw test -Dtest=VehicleCapacityRaceCriteriaTests
```

`VehicleCapacityRaceCriteriaTests`: a route with 7 students on an 8-seat bus; one request lowers the seats to 7 (or puts a 7-seat vehicle on the route) while another adds an eighth student. It fails with `9 of 10 rounds overfull: [round 1: statuses [200, 200] left 8 students on 7 seats ...` and `10 of 10` for the smaller-vehicle case. (Round 0 can pass on a cold pool.) The companion `VehicleCapacityCriteriaTests` (9 tests, including two simultaneous reductions) passes on #107.

**Repro (by hand).** On the jar built from `develop` + #107 (4 students on a 5-seat bus), fire together:

```bash
curl -X PATCH "$BASE/api/head-of-transport/vehicles/$VEHICLE/capacity" -H 'Content-Type: application/json' -b "wassel_token=$HEAD" -d '{"capacity":4}' &
curl -X POST  "$BASE/api/head-of-transport/routes/$ROUTE/students"      -H 'Content-Type: application/json' -b "wassel_token=$HEAD" -d "{\"studentId\":\"$FIFTH\"}" &
wait; curl -s -b "wassel_token=$HEAD" "$BASE/api/head-of-transport/routes/$ROUTE"   # "seatsLeft": -1
```

25 of 25 tries answered `200 + 200` and left 5 students on 4 seats (`seatsLeft: -1`); the same for a 4-seat vehicle put on the route by `PUT` (25 of 25). Two reductions at once (to 5 and to 3 on a route of 4) behaved: `200 + 409` in 25 of 25, and two reductions to the exact count both answered 200.

**Expected.** Whichever request commits first wins and the other answers 409; afterwards students never outnumber seats.

**Fix direction (not applied).** The two requests need a lock in common. `backend/CLAUDE.md` already names it for the optimization and generation features ("closing it needs a route-row lock that every stop-changing method also takes"): lock the route row (`select ... for update`) in `addStudent`, `editRoute`, and the capacity path (`setCapacity` finds the vehicle's route first, then locks it before counting). If the team prefers to accept this as a documented known limit like SCRUM-203's, the 241 acceptance criterion "can never be negative" should then say "through a single request", and `VehicleCapacityRaceCriteriaTests` should be dropped.

**Related stale text on the same PR.** `docs/contracts/routing.md:52` (`RouteSummary.seatsLeft`) still says it "is negative when the route is over capacity, which happens if the vehicle's capacity is lowered after students were assigned". PR #107 changes no file under `docs/contracts/`. After the merge that sentence is false for single requests and, because of this bug, only true for the race.

**Paste-ready comment.**

> **Bug (SCRUM-241, found by the SCRUM-236 tests):** the rule holds for one request at a time (the 9 tests in `VehicleCapacityCriteriaTests` pass on this PR), but a reduction and an added student sent at the same instant leave the route overfull: with 7 students on 8 seats, one request lowers the seats to 7 while another adds an eighth student, and the route ends with 8 students on 7 seats (`seatsLeft: -1`), in 9 of 10 rounds in tests and 25 of 25 by hand; the same for `PUT /routes/{id}` with a smaller vehicle. `setCapacity`, `editRoute` and `addStudent` each check against a value the other is about to change and write different rows, so nothing makes one wait for the other. Repro: `sh ./mvnw test -Dtest=VehicleCapacityRaceCriteriaTests` (needs this PR's code). Suggested: lock the route row in all three paths (the lock `CLAUDE.md` already describes for 203/207), or word the criterion as single-request and note it as a known limit. Also: `docs/contracts/routing.md:52` says `seatsLeft` can be negative; please update it in this PR.

---

## BUG-3: `AbsenceControllerTests` fails in CI every night from 22:00 to 24:00 UTC (a bad test, not the feature)

**Severity: Important for CI, none for users.** It is not caused by SCRUM-236 or by any change in this branch; it was already in `develop`. It turns the backend check red on any PR whose CI happens to run in that window (this PR's did, twice, at 23:34 and 23:36 UTC).

**Where.** `backend/src/test/java/com/wassel/backend/absences/controller/AbsenceControllerTests.java:350`, in `cancellingAnInProgressAbsenceShortensItInsteadOfDeletingIt`. The test builds its dates from `LocalDate.now()` (15 uses in the file), which takes the date in the JVM's default zone: UTC on GitHub's runners, Beirut on a laptop in Lebanon. The application takes "today" from the `Clock` bean, which is `Asia/Beirut`. From 22:00 to 24:00 UTC it is already the next day in Beirut, so the service shortens the in-progress absence to Beirut's yesterday while the test expects UTC's yesterday:

```
AbsenceControllerTests.cancellingAnInProgressAbsenceShortensItInsteadOfDeletingIt:350 expected: <2026-10-31> but was: <2026-11-01>
```

Only this assertion is sensitive: it compares an exact date. The other 14 uses add days (`plusDays(1)` and up) with enough slack to survive a one-day shift.

**Evidence.** The failure is identical in both CI runs of this PR (23:34 and 23:36 UTC on 2026-11-01, which is 01:34 on Monday in Beirut), and in no other test. `develop`'s own CI passed at 16:05 UTC the same day. It passes on a machine whose zone is Beirut at any hour, which is why it was not seen locally.

**Reproduce.** Run the class in the window, with the JVM in UTC: `TZ=UTC sh ./mvnw test -Dtest=AbsenceControllerTests` between 22:00 and 24:00 UTC. The window is the only time the two dates differ, so there is no always-failing command; use the CI log above as the evidence.

**Fix direction (not applied; it is the author's test).** Take the date from the same clock the application uses: inject the `Clock` bean, or use `LocalDate.now(ClockConfig.SCHOOL_ZONE)`. Better, pin it the way `RunControllerTests` and the SCRUM-236 suites do (`MutableClock`), so the test never depends on the day it runs. The new `AbsenceCriteriaTests` cover the same rule (`cancellingAnAbsenceInProgressKeepsTheDaysAlreadyGone`) with a pinned clock and pass at any hour.

**Paste-ready comment.**

> **Flaky test (SCRUM-238):** `AbsenceControllerTests.cancellingAnInProgressAbsenceShortensItInsteadOfDeletingIt` (line 350) fails in CI every night between 22:00 and 24:00 UTC (`expected: <2026-10-31> but was: <2026-11-01>`). The test uses `LocalDate.now()`, the JVM's zone (UTC on the runners), but the service uses the Beirut `Clock`, so for those two hours they disagree about the date. Please use the injected `Clock` (or `MutableClock`, as in `RunControllerTests`). Seen on PR #108's CI at 23:34 and 23:36 UTC; a re-run after midnight UTC passes.
