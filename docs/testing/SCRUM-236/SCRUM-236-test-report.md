# SCRUM-236: independent tests for absences, the parent API, the capacity rule and account lockout, test report

Written by Hashem, the independent tester of Moustafa's SCRUM-238, 239, 240, 241 and 171. Dated 2026-11-02, the day before the sprint ends. The two bugs found are written up with repros in [`SCRUM-236-bugs.md`](SCRUM-236-bugs.md).

## What was built

- Five suites, one per story, in the packages their code lives in: `AbsenceCriteriaTests` (238), `AbsentOnRunCriteriaTests` (239), `ParentChildrenCriteriaTests` (240), `VehicleCapacityCriteriaTests` (241), `AccountLockoutCriteriaTests` (171). Two more hold the race checks: `AbsenceRaceCriteriaTests` and `VehicleCapacityRaceCriteriaTests`.
- Shared test support in `common/`: `CriteriaTestSupport` (the real application on the PostgreSQL container, a signed-in caller, rows, and `inParallel` for requests at the same instant) and `MondayClockConfig`. The lockout suite stands alone because it also watches the `Mailer` and the log.
- No production code and no new dependency. `backend/CLAUDE.md` has a paragraph on the suites and their switches.
- This report, the bug write-ups in [`SCRUM-236-bugs.md`](SCRUM-236-bugs.md), and `handrun_236.py`, the script behind the by-hand numbers.

## Tests first

- From the ticket's acceptance criteria and `docs/contracts/runs.md` (and its samples, plus the 409 row of `docs/contracts/routing.md` for the capacity rule). **Not** from the authors' suites: `AbsenceControllerTests`, `ParentControllerTests`, `VehicleControllerTests` and `AuthControllerTests` were not opened, and neither was any service code while the tests were written. The entities were read only to build rows, and `RoleAccessMatrixTests` only for endpoint paths. The implementation was read afterwards, only to explain the two bugs.
- Assertions are on HTTP responses (MockMvc on the real application), on the PostgreSQL 16 container with the real Flyway migrations from SCRUM-252. A few expected values (a driver's phone, a vehicle's plate) are read back from the repositories that built the rows, and the lockout suite also watches the `Mailer` and the captured log, which is what its criteria are about. The only thing moved is the clock: `MondayClockConfig` pins "today" to Monday 2026-11-02, so no test depends on the weekday CI runs on.
- Every suite uses its own random school ids and deletes nothing, because all test classes share one database.
- **Two independence limits, stated rather than hidden.** (1) `todayRun` on `GET /api/parent/children` is SCRUM-237, written by the same person as these tests, so 240's suite checks it only for presence (and null for a child with no route), never for its values. (2) Hashem reviews PR #107 (241) and will review 171's, so these tests are the review's evidence, not a second opinion on it.

## Where each story stands

| Story | Jira on 2026-11-02 | In `develop`? | Tests | Result |
|---|---|---|---|---|
| 238 absences | Done | yes (#97) | `AbsenceCriteriaTests` (29) | 29 pass |
| 238, two reports at once | | | `AbsenceRaceCriteriaTests` (2) | **known bug (BUG-1)**: fails today, skipped in CI |
| 239 absent on the run | Done | yes (#98) | `AbsentOnRunCriteriaTests` (13) | 13 pass |
| 240 parent API | Done | yes (#100) | `ParentChildrenCriteriaTests` (13) | 13 pass |
| 241 seats vs students | In Review | **no**, PR #107 open | `VehicleCapacityCriteriaTests` (9) | **pending the merge**: skipped in CI; 9 of 9 pass on `develop` + #107 merged locally |
| 241, a reduction racing an added student | | | `VehicleCapacityRaceCriteriaTests` (2) | **known bug (BUG-2)**: fails on `develop` + #107, skipped in CI |
| 171 account lockout | To Do | **no**, no branch or code | `AccountLockoutCriteriaTests` (10: 7 plus a nested group of 3) | **pending the merge**: skipped in CI (the build counts the nested group as one skip, so 8); not yet run against an implementation |

Three switches keep classes out of the build; a skipped test is reported as skipped, never as passed:

| Switch | Classes | Meaning |
|---|---|---|
| `-Dpending.SCRUM-241=true` / `-Dpending.SCRUM-171=true` | `VehicleCapacityCriteriaTests`, `VehicleCapacityRaceCriteriaTests` / `AccountLockoutCriteriaTests` | the story is not merged. Delete the `@EnabledIfSystemProperty` line when it is |
| `-Dknown-bug.SCRUM-238-race=true` / `-Dknown-bug.SCRUM-241-race=true` | `AbsenceRaceCriteriaTests` / `VehicleCapacityRaceCriteriaTests` | the test fails today on a bug in `SCRUM-236-bugs.md`. Delete the line when it is fixed |

Run one with `sh ./mvnw test -D<switch>=true -Dtest=<Class>`.

**The guarded tests were also checked the other way**, to prove they can fail:

| Class, switches on | Against | Result |
|---|---|---|
| `AccountLockoutCriteriaTests` | `develop` (no lockout) | 10 run, **7 fail** for the right reasons (the right password after five failures got 204, not 401; no lock line in the log; the configured lock did not apply; a case variant of the email was not locked). The 3 that need no lock pass: four failures do not lock, a completed sign-in resets the count, the lock is per account |
| `VehicleCapacityCriteriaTests` | `develop` (no 241 rule) | the refusals fail (200, not 409); the allowed cases pass |
| `VehicleCapacityCriteriaTests` | `develop` + #107 merged (not committed) | **9 of 9 pass** |
| `VehicleCapacityRaceCriteriaTests` | `develop` + #107 | 2 run, **2 fail**: 9 of 10 and 10 of 10 rounds left more students than seats |
| `AbsenceRaceCriteriaTests` | `develop` | 2 run, **2 fail**: 17 of 25 and 13 of 25 rounds answered 500 |

## What each test guarantees

### SCRUM-238, `AbsenceCriteriaTests`

| Criterion | Tests |
|---|---|
| A parent reports one day or a range, for their own child | `aParentReportsOneDayForTheirChild`, `aParentReportsARangeOfDays`, `twoChildrenCanBeAbsentTheSameDay` |
| Past dates are 400 (field named), `toDate` before `fromDate` is 400, bad bodies and ids | `todayIsAllowedButYesterdayIsNot`, `aRangeThatEndsBeforeItStartsIsRejected`, `aMissingFromDateIsRejected`, `aDateThatIsNotADateIsMalformed`, `anIdThatIsNotAUuidIsAnInvalidParameter` |
| "Today" is the date in Beirut, not UTC | `todayIsTheDateInBeirutNotInUtc` (00:30 Monday in Beirut is still Sunday in UTC) |
| Overlap rule: exact repeat 200 and writes nothing; any other overlap 409; touching is fine | `anExactRepeatIsTheSameAbsenceAndWritesNothing`, `aSingleDayRepeatedWithAnExplicitEqualToDateIsStillARepeat`, `anyOtherOverlapIsRefusedAndNamesTheDateField`, `absencesThatOnlyTouchAreBothKept` |
| The list is upcoming absences, ordered by `fromDate` | `theListIsUpcomingAbsencesOrderedByFromDate`, `anAbsenceThatIsOverIsNotListedButOneInProgressIs` |
| Cancel: an upcoming absence is gone and its dates free; one in progress keeps the days already gone, and cancelling it again is 409; one that ended is 409; a second cancel of an upcoming one is 404 | `cancellingAnUpcomingAbsenceRemovesItAndFreesTheDates`, `cancellingAnAbsenceInProgressKeepsTheDaysAlreadyGone`, `cancellingAnAbsenceThatEndedBeforeTodayIsAConflict`, `cancellingTheSameAbsenceTwiceIsNotFound` |
| **Ownership (security):** no read, report or cancel for a child that is not theirs; the data never leaks; nothing changes | `aParentCannotReadAnotherFamilysChildAbsences`, `aParentCannotReportAbsenceForAnotherFamilysChild`, `aParentCannotCancelAnotherFamilysChildAbsence`, `anUnknownChildIsNotFoundForEveryAction`, `anAbsenceIdUnderTheWrongChildIsNotFoundEvenForTheSameParent`, `theSameUserIdInAnotherSchoolDoesNotOwnTheChild`, `aStudentNobodyIsLinkedToBelongsToNoParent` (all 404, as the contract says; each one then checks that nothing was written, through the owner's list or the head's list) |
| Roles: head, driver and admin get 403 on GET, POST and DELETE of the parent endpoints, signed out gets 401, and nothing is written; a parent gets 403 on the head's list | `onlyAParentMayUseTheParentEndpointsAndOnlyTheHeadMayListBySchool` |
| The head lists every absence covering a date, for their own school only | `theHeadListsEveryAbsenceCoveringADate`, `aHeadOnlySeesTheirOwnSchoolsAbsences` |
| Two reports at the same moment: never 5xx, one created, one stored | `AbsenceRaceCriteriaTests`: `twoIdenticalReportsAtTheSameTimeStoreOneAndNeverFail`, `twoOverlappingReportsAtTheSameTimeStoreOneAndNeverFail` (known bug) |

### SCRUM-239, `AbsentOnRunCriteriaTests`

| Criterion | Tests |
|---|---|
| Today's run marks each absent student; only that student; both runs; counts | `todaysRunMarksOnlyTheStudentWhoIsAbsentToday`, `anAbsenceCoversTheAfternoonRunToo`, `aRangeThatIncludesTodayMarksTheStudent`, `anAbsenceOnAnotherDayDoesNotMarkToday` |
| A range marks the first, middle and last day and not the day after; cancelling part-way clears the rest | `aRangeMarksTheStudentOnEveryDayItCoversAndNotTheDayAfter`, `cancellingPartWayThroughARangeClearsTheRestOfIt` |
| An absence reported after the run started shows on the next fetch | `anAbsenceReportedAfterTheRunStartedShowsOnTheNextFetch` (the run is `IN_PROGRESS`) |
| A cancelled absence is not shown | `aCancelledAbsenceIsNotShown` |
| A confirmation wins over `absent` in the counts (contract), the stop keeps the flag | `anAbsentStudentTheDriverStillPickedUpIsCountedAsPickedUpNotAbsent` |
| The head sees who is absent today, with route and stop number (the place on the route, 1 and 2 after a student left, not the stored gap); no route is null and null | `theHeadSeesWhoIsAbsentTodayWithTheirRouteAndStop`, `theHeadsStopNumberIsTheStudentsPlaceOnTheRouteNotAGapLeftByAStudentWhoLeft`, `anAbsentStudentWithNoRouteIsListedWithNoRouteAndNoStop`, `theHeadsListLeavesOutCancelledAbsencesAndOtherDays` |
| "A stop where every student is absent is skippable" | **Not testable on the server**: see the conflicts below |

### SCRUM-240, `ParentChildrenCriteriaTests`

| Criterion | Tests |
|---|---|
| Every child with route name, driver name and phone, vehicle plate, expected pickup time | `aChildOnARouteComesWithRouteDriverVehicleAndPickupTime`, `theFirstStopIsPickedUpBeforeTheSecond`, `everyChildIsListedOrderedByFirstName` |
| The pickup time is the arrival time of that student's stop on the route, not just a time in range | `theExpectedPickupTimeIsTheArrivalTimeOfThatStudentsStopOnTheRoute` |
| No school arrival time means no pickup time but the route is still shown | `withNoSchoolArrivalTimeThereIsNoPickupTimeButTheRouteIsStillShown` |
| A child with no route is a "no route yet" state, not an error | `aChildWithNoRouteYetHasNullRouteDriverVehicleAndTimeInsteadOfAnError`, `aParentWithNoChildrenGetsAnEmptyList` |
| **Never other families' children (security)**: same school, unlinked, other school | `aParentNeverSeesChildrenLinkedToSomeoneElse`, `theSameUserIdInAnotherSchoolSeesNoneOfThisSchoolsChildren`, `aSiblingsRouteAndDriverAreNotMixedUp` |
| Only the PARENT role | `onlyTheParentRoleCanCallIt` (403 for head, driver, admin; 401 signed out) |
| The response matches the contract sample | `theResponseHasTheFieldsOfTheContractSample` (reads `docs/contracts/samples/runs/parent-children.json`: the same keys for a child with and without a route, and for `route`, `driver`, `vehicle`; `todayRun` only by presence) |
| `todayRun` is present | `aChildOnARouteHasATodayRunField` (presence only, see the independence note) |

### SCRUM-241, `VehicleCapacityCriteriaTests` (pending the merge of #107)

The route has 7 students and the too-small capacity is 2, so the message check matches whole numbers (7 and 2) that a plate, an id or a date in the text cannot satisfy by accident.

| Criterion | Tests |
|---|---|
| Lowering capacity below the students is 409 with the count and the capacity, and nothing changes | `loweringSeatsBelowTheStudentsOnItsRouteIsRefusedWithTheCountAndTheCapacity`, `oneSeatFewerThanTheStudentsIsRefusedToo` |
| Lowering to exactly the number of students is allowed | `loweringSeatsToExactlyTheNumberOfStudentsIsAllowed` |
| A vehicle on no route can be set to any valid capacity | `aVehicleNotOnAnyRouteCanBeSetToAnyValidCapacity`, `raisingSeatsOnAVehicleWithARouteIsAllowed` |
| A smaller vehicle on a route with more students is refused the same way | `aSmallerVehicleThanTheStudentsOnTheRouteIsRefusedTheSameWay` |
| An exact-fit or bigger vehicle is allowed | `aVehicleWithExactlyAsManySeatsAsStudentsIsAllowedOnTheRoute`, `aBiggerVehicleIsAllowedOnTheRoute` |
| Two reductions at the same moment: one allowed, one 409, enough seats left | `twoReductionsAtTheSameTimeLeaveTheBusWithEnoughSeats` |
| Seats left can never be negative | asserted after every refused change on this test's own route (it must be present, with its students and a real `seatsLeft`) and on every route of the school |
| A reduction or a smaller vehicle at the same moment as an added student | `VehicleCapacityRaceCriteriaTests`: `aReductionAndAnAddedStudentAtTheSameTimeNeverOverfillTheRoute`, `aSmallerVehicleAndAnAddedStudentAtTheSameTimeNeverOverfillTheRoute` (known bug, BUG-2) |

### SCRUM-171, `AccountLockoutCriteriaTests` (pending the merge of 171)

| Criterion | Tests |
|---|---|
| Five failures in a row lock the account; the right password is then refused, with no session and **no code emailed** (an emailed code would show the password was right) | `afterFiveFailuresInARowTheRightPasswordIsRejectedAndNoCodeIsSent` |
| Four failures do not lock | `fourFailuresDoNotLockTheAccount` |
| The locked error is the same generic error as a wrong password and as an unknown email (status, body and every header), so nobody can tell whether the email exists | `aLockedAccountAnswersExactlyLikeAWrongPasswordAndLikeAnUnknownEmail` |
| The lock does not depend on how the email is typed (capitals, spaces); skipped if sign-in itself is case-sensitive | `theLockDoesNotDependOnHowTheEmailIsTyped` |
| A successful sign-in resets the counter | `aSuccessfulSignInResetsTheCount` (a **completed** sign-in, password and code) |
| The lock is per account | `theLockBelongsToTheAccountNotToEveryone` |
| Every lock is logged naming the account (a line the fifth failure writes and the fourth does not), and no password is | `everyLockIsLoggedAndNoPasswordIsInTheLog` |
| Both numbers are settings; the lock ends on its own; the count starts over after it; a second lock is logged too | `WithAShortLock`: `bothNumbersAreSettingsAndTheLockEndsOnItsOwn`, `afterTheLockEndsTheCountStartsOverSoOneFailureDoesNotLockAgain`, `aSecondLockIsLoggedToo`. **They use assumed setting names** (`wassel.auth.lockout.max-failures`, `wassel.auth.lockout.duration`); correct them to the real keys |

## What failed

Every failure during the work, and whether the fault was in the feature or in the test. Only the first two are feature bugs; both need two requests at the same instant, so the stories' single-request tests pass. Details, root causes, repros and paste-ready comments are in [`SCRUM-236-bugs.md`](SCRUM-236-bugs.md).

| # | What failed | Feature or test? | Outcome |
|---|---|---|---|
| 1 | **BUG-1, SCRUM-238 (merged):** two reports for one child at once can answer **500** (15 of 25 identical, 17 of 25 overlapping, over real HTTP; 17 and 13 of 25 in the tests). PostgreSQL resolves the clash as a deadlock, which `AbsenceService.reportAbsence` does not catch. One row is stored every time | **Feature bug** | `AbsenceRaceCriteriaTests`, skipped until fixed. Needs a bug ticket (238 is merged) |
| 2 | **BUG-2, SCRUM-241 (#107):** a seat reduction, or a smaller vehicle, at the same moment as an added student leaves the route overfull, `seatsLeft: -1` (25 of 25 by hand; 9 and 10 of 10 in the tests). One after the other the rule holds | **Feature bug** | `VehicleCapacityRaceCriteriaTests`, skipped until fixed. Raise on #107 |
| 3 | The lockout log test found the wrong password in the captured output | **Bad test (artefact):** MockMvc's default printout wrote the request body to stdout | Fixed: `print = NONE` for that class |
| 4 | The lockout log test passed on `develop`, where nothing locks | **Bad test:** the bare word "lock" matches "clock" and "block" | Fixed: needs a line naming the account that the fifth failure writes and the fourth does not |
| 5 | `afterTheLockEndsTheCountStartsOver...` passed on `develop` | **Bad test:** no precondition that the account was locked | Fixed: asserts the lock first |
| 6 | The 241 message checks (`containsString("4")`) could match a plate or an id | **Weak test** (never failed) | Fixed: whole-number match on 7 students and 2 seats |
| 7 | `assertNoRouteIsOverfull` looped over `$[*].seatsLeft` and asserted nothing if the field was missing | **Weak test** (never failed) | Fixed: checks this test's own route explicitly |
| 8 | The first run of the identical-reports race passed in a fresh JVM | **Test power:** a cold connection pool serialises the two requests | Fixed: 25 rounds |
| 9 | `mvnw` is `Permission denied` in this checkout | Repository (file mode), not the feature | Run as `sh ./mvnw`; not changed here |

No test failed on the merged stories' single-request behaviour (238, 239, 240). The findings for a PR are the two bugs and conflict 1 below.

## Conflicts between the criteria and the contracts (raised, not decided by a test)

1. **241 against `routing.md` (`RouteSummary.seatsLeft`):** the contract says it "is negative when the route is over capacity, which happens if the vehicle's capacity is lowered after students were assigned"; 241's criterion says it can never be negative. PR #107 changes no file under `docs/contracts/`, so that line is stale after the merge. The tests assert the ticket. **Owner: Moustafa, on #107.**
2. **239 "a stop where every student is absent is skippable":** the contract defines a stop as one student and says "skippable" is worked out by the screen (absent and no confirmation); the server sends only `absent`. The server side of the criterion is the `absent` flag and `counts.absent`, tested above. **Owner: the ticket text, SCRUM-239.**
3. **240 "matches the sample in `runs.md`":** the sample is `samples/runs/parent-children.json`, and since SCRUM-237 it includes `todayRun`. See the independence note.
4. **238 "403 or 404":** the contract settles it as 404 for every ownership case, which is what is asserted.
5. **238, a lost race is 409, the contract says a repeat is 200.** `backend/CLAUDE.md` documents the 409 "try again" as intended; the contract says a retried exact repeat is harmless (200). Decision for the author (BUG-1 describes both ways).

## Open questions (not asserted)

- **171, for the author before the code is written:** (1) the setting names and units; (2) whether "successful sign-in" resets on the correct password (step 1) or on the finished 2FA step: the test uses a completed sign-in, which holds under either; (3) whether wrong 2FA codes count towards the five; (4) whether unknown emails and invited accounts (the `"!"` hash) can build up a lock; (5) the log level of a lock and whether the line names the user id or the email (the test accepts either).
- **171, for the PO:** a lock per account means anyone who knows an email can lock that person out for 15 minutes by failing five times. That is the usual trade-off of lockout, not a bug, but the ticket does not mention it. Not tested.
- **241:** which 409 wins when a route edit hits both the capacity rule and the active-run rule (SCRUM-233). Not tested.

Settled while testing, so no longer open: cancelling an absence that was cut to yesterday a second time is **409** ("ended before today"), by `runs.md` and by the running app; it is asserted in `cancellingAnAbsenceInProgressKeepsTheDaysAlreadyGone`.

## Runs

| Run | Result |
|---|---|
| Whole backend, `sh ./mvnw verify` (2026-11-02, 3 min, PostgreSQL 16 in Testcontainers) | 1105 run, 0 failed, 22 skipped (the 21 guarded tests of this ticket, with the lockout nested group counted once, and 1 that was already skipped), BUILD SUCCESS |
| The five SCRUM-236 suites on a separate real PostgreSQL 16 (a container on port 5441, `-Dspring.datasource.url=...`, Flyway V1 to V8 applied to an empty database, `ddl-auto=validate`) | 51 live tests pass, guarded ones skipped (run before the later additions; the 55 live tests ran on the Testcontainers database) |
| Coverage, JaCoCo from the first full run, lines of the modules under test | absences service 100%, parent service 100%, vehicles service 93%, auth service 98.5%; controllers 75 to 87% (the unexecuted lines are mostly branches of other endpoints) |

## End to end by hand (2026-11-02)

Against the packaged jar of `develop` + #107 on port 8090 and a throwaway PostgreSQL 16 on port 5441, with sessions minted as JWT cookies and rows seeded by SQL (`handrun_236.py`).

| Check | Result |
|---|---|
| Wrong roles | driver, head of transportation and admin: **403** on `GET /parent/children` and on GET, POST and DELETE of a child's absences; signed out **401**; a parent on the head's endpoints **403**; another family's parent **404** on all three absence actions; no row written by any of them |
| Two identical reports at once, 25 tries | `201+500` 15, `201+409` 10 (BUG-1); exactly one row each time |
| Two overlapping reports at once, 25 tries | `201+500` 17, `201+409` 8; exactly one row each time |
| Two seat reductions at once (to 5 and to 3, 4 students on 6 seats), 25 tries | `200+409` in 25 of 25; two reductions to the exact count: `200+200` in 25 of 25 |
| A reduction against an added student, and a smaller vehicle against an added student, 25 tries each | **overfull in 25 of 25** (BUG-2). One after the other: `409` for the second in 5 of 5 each way |

`mvnw` is not marked executable in this checkout, so it is run as `sh ./mvnw`.

## Found while writing

- MockMvc's default `print` writes every request, including the login body with the password, to stdout. A test that asserts on captured output must switch it off (`@AutoConfigureMockMvc(print = MockMvcPrint.NONE)`), or it sees its own request as an application log line. Not an application bug; recorded for whoever writes the next log assertion.
- The first requests in a fresh JVM do not race: a cold connection pool serialises them, so a race test needs many rounds (25 here) to be reliable.

## Not covered

- **171 against a real implementation.** The class has not run green. Its setting names are assumed, and the lock-expiry tests sleep for real (2.5 s) because the auth code reads `Instant.now()`, not the `Clock` bean, so the 15-minute default is never exercised.
- **Wrong 2FA codes, unknown emails and invited accounts** under lockout: the criteria do not say whether they count. **Parallel failed sign-ins** racing the counter: not tested, since there is no implementation.
- **The merged code was not mutated** to prove each assertion fails when its rule breaks; only the guarded suites were run against code without the rule.
- **Time zones beyond one case.** Beirut-versus-UTC "today" is tested once (`todayIsTheDateInBeirutNotInUtc`); no application query reads the database clock (checked by search), so pinning the Java clock is enough.
- **Weekends.** The suites run on a pinned Monday; the holiday behaviour of runs belongs to SCRUM-233's suites.
- **Once the guards are removed**, the lockout class adds two Spring contexts to the shared test database (see `backend/CLAUDE.md`).
