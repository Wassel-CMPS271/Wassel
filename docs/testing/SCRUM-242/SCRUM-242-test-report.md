# SCRUM-242: independent tests of the daily runs, start and end, confirmations and the parent's run status

## What was added

Three test files, 52 tests, all on the real PostgreSQL schema like every backend test (SCRUM-252):

| File | What it covers | Tests |
|---|---|---|
| `backend/src/test/java/com/wassel/backend/common/RunCriteriaSupport.java` | The shared fixtures: a fresh school on Wednesday 2026-11-04 at 07:00 in Beirut (a `MutableClock`), routes made by the head of transportation through `POST /routes`, drivers with a linked sign-in account, pinned students, parents, the holiday and half-day calendar | none |
| `backend/src/test/java/com/wassel/backend/runs/controller/RunCriteriaTests.java` | SCRUM-233 (daily runs), SCRUM-234 (start and end), SCRUM-235 (confirmations), and the contract's rules on moving a child or changing a route during a run | 38 (1 skipped, finding F-1) |
| `backend/src/test/java/com/wassel/backend/parent/controller/ParentRunStatusCriteriaTests.java` | SCRUM-237 (the parent's `todayRun`) | 14 |

The runs code is Hashem's. These tests were written by Moustafa from the acceptance criteria of SCRUM-233, 234, 235 and 237 and from `docs/contracts/runs.md`, **not** from `RunControllerTests`, `ParentRunStatusTests` (Hashem's own suites) or the runs code. The code was read only afterwards, to choose the lines broken in the mutation check below. Everything a person does goes through the HTTP API: the head creates routes, adds, moves, removes and reorders students; the driver opens today's runs, starts, ends and confirms; the parent reports an absence and reads their children. Only what has no endpoint (accounts, the calendar, a pin, a parent link) is saved directly.

Run them with `sh ./mvnw test -Dtest='RunCriteriaTests,ParentRunStatusCriteriaTests'` (Docker needed, as for every backend test). CI's `backend-build` runs them with the rest.

## Acceptance criteria

### SCRUM-233: daily runs

| Criterion | Tests | Result |
|---|---|---|
| Every route gets one morning and one afternoon run for today, with the route's stops in their current order | `aDriverGetsTodaysMorningAndAfternoonRunsWithTheRoutesStopsInOrder` (order, positions 1..n, arrival times, `schoolTime`, route, vehicle, driver, guardian, `absent`, `confirmation`, `removedFromRoute`, counts); `theAfternoonRunIsTheMorningReversedWithNoTimes`; `aReorderShowsOnTheSameRunsAtOnce` (same run ids, new order) | Met |
| Asking twice never creates duplicates, including under concurrent requests | `askingAgainReturnsTheSameTwoRuns`; `simultaneousRequestsCreateEachRunOnce` (16 requests at once from two drivers and the head: all 200, exactly four runs) | Met |
| No runs on a holiday (and, per the contract, on Saturday and Sunday) | `aHolidayAndAWeekendHaveNoRuns` (driver and head, both weekend days); `aHolidayAddedLaterHidesTheRunsAndRemovingItShowsTheSameOnes` | Met |
| Half-day afternoon run (settled by the contract: `schoolTime: null`) | `aHalfDayKeepsTheMorningTimeAndHasNoAfternoonTime` (driver and head); `schoolTimeIsNullWhenTheSchoolHasNotSetIt` | Met |
| A driver fetches only their own runs; the head fetches every run for a date | `aDriverSeesOnlyTheirOwnRunsAndOneWithNoRouteSeesNone`; `theHeadSeesEveryRouteInOrderWithoutStops` (oldest route first, morning before afternoon, no `stops`); `anotherDateOnlyReadsAndCreatesNothing` (future and past dates read only, today's runs show on their date the next day); `anotherSchoolSeesNothing` | Met, except finding F-1 (the head's `counts.absent`) |

### SCRUM-234: start and end a run

| Criterion | Tests | Result |
|---|---|---|
| A driver can start a run that has not started, and the time is saved | `startAndEndSaveTheirTimesAndTheHeadSeesThem` (the time is the clock's) | Met |
| A driver can end a run in progress, and the time is saved | the same test | Met |
| Starting a finished run, or ending one not started, is a 409 naming the state | `startingAFinishedRunOrEndingOneNotStartedIsAConflictNamingTheState` | Met |
| A driver cannot start or end another driver's run (404) | `aRunThatIsNotTheDriversIsNotFound` (another driver, an unknown id, the same user in another school; the run stays `NOT_STARTED`); `yesterdaysRunAndAHolidayHiddenRunAreNotFound` (the contract's 404 for a run not in today's list, including a repeated end after midnight) | Met |
| The head sees each run's state and start and end times | `startAndEndSaveTheirTimesAndTheHeadSeesThem` | Met |
| Contract extras | `aRepeatedStartOrEndChangesNothing` (200, first time kept); `theAfternoonRunCanStartBeforeTheMorningOne`; `aRunIdThatDoesNotParseIsABadRequest` | Met |

### SCRUM-235: confirmations

| Criterion | Tests | Result |
|---|---|---|
| Pickup, drop-off and not-present can be recorded on a run in progress, with the server's time | `aConfirmationIsRecordedWithTheServersTime` (a client `at` in the body is ignored); `theAllowedMovesAreRecorded` (none to picked up to dropped off, not present to picked up) | Met |
| Only students on that run (404) | `aStudentWhoIsNotOnTheRunIsNotFound` (a student of the school on no route, an unknown id) | Met |
| The same confirmation twice keeps one record | `theSameConfirmationTwiceKeepsTheFirstTime`; `aLateRetryOfAnEarlierStatusKeepsTheLaterOne` | Met |
| No drop-off before pickup (409 naming the current status) | `theRefusedMovesAreConflictsNamingTheCurrentStatus` (also not present after a pickup, and anything after a drop-off) | Met |
| Refused (409) unless the run is in progress | `aConfirmationOutsideAnInProgressRunIsAConflict` (not started, finished) | Met |
| The driver's run shows each latest confirmation; the head's runs show real counts | the confirmation tests read the answer's stops; `theHeadsCountsFollowTheConfirmations` (`pickedUp` includes the dropped off); `anAbsentChildCanStillBeConfirmedAndThenCountsUnderThatStatus` | Met for `pickedUp`, `droppedOff`, `notPresent`; `absent`: finding F-1 |
| SCRUM-242 security: a driver cannot confirm on another driver's run | `anotherDriverCannotConfirmOnTheRun`; `theRunIsCheckedBeforeTheStudentAndTheState` (the contract's check order) | Met |
| Errors table | `aMissingOrUnknownStatusIsABadRequest` | Met |

Moving a child or changing a route during a run (contract, from SCRUM-233's review and SCRUM-235): `aChildOnTheBusCannotBeMovedUntilTheRunEnds` (409 for a move and a removal, naming the child, the route and 07:12; re-adding to the same route is not a move; allowed once the run ends), `aConfirmedChildWhoLeftTheRouteStaysOnTheRunLast`, `anUnconfirmedChildMovedDuringTheRunLeavesItAtOnce`, `theDriverOrVehicleCannotChangeWhileARunIsInProgress` (a rename is allowed), `aRunLeftInProgressYesterdayBlocksNothingToday`. All met.

### SCRUM-237: the parent's run status

| Criterion | Tests | Result |
|---|---|---|
| Each child shows today's run state | `beforeTheDriverOpensTheRunsTheMorningShowsNotStartedAndNothingIsCreated` (no run row is created by the parent's GET); `theShownRunFollowsTheDay` (in progress, then the afternoon not started, then finished); `bothRunsInProgressShowTheMorning`; `anAfternoonStartedFirstIsShown`; `todayRunIsNullWithNoRouteAndOnAHolidayOrWeekend`; `aHalfDayStillShowsItsRun` | Met |
| While in progress, the stops left before the child (0 means next, null means no count) | `stopsLeftDropsAsTheDriverConfirmsAndIsZeroWhenTheChildIsNext` (3, 2, 1, 0, then null once picked up); `aStopPickedUpOutOfOrderDoesNotCount`; `anAbsentStopBeforeTheChildDoesNotCountUnlessConfirmed`; `anAbsentChildHasNoCount`; `theAfternoonCountsInReverseOrderUntilTheChildIsDroppedOff` (picked up at the gate is not done); `aReorderChangesTheCountAtOnce` (the count can go up) | Met |
| A parent only sees this for their own children | `twoParentsOnTheSameBusEachSeeOnlyTheirOwnChild`; `aParentOfAnotherSchoolSeesNothing` (the same user id in another school) | Met |

## Do the tests fail when the code breaks?

Each line of `RunService` was broken on its own, the two classes run, and the line put back (`git status` clean afterwards; the script that did it is not committed).

| Line broken | Tests that went red |
|---|---|
| The confirmation table allows not present after a pickup | `theRefusedMovesAreConflictsNamingTheCurrentStatus` |
| The confirmation table allows a drop-off without a pickup | `theRefusedMovesAreConflictsNamingTheCurrentStatus` |
| `pickedUp` stops counting those dropped off | `theHeadsCountsFollowTheConfirmations` |
| Saturday and Sunday are no longer holidays | `aHolidayAndAWeekendHaveNoRuns`, `todayRunIsNullWithNoRouteAndOnAHolidayOrWeekend` |
| The parent's afternoon count uses the morning order | `theAfternoonCountsInReverseOrderUntilTheChildIsDroppedOff` |
| A confirmation is accepted while the run is not in progress | `aConfirmationOutsideAnInProgressRunIsAConflict` |

6 of 6 broken lines were caught, each by the test written for that rule.

## Findings

### F-1: the head of transportation's runs always show `counts.absent` as 0 (raised as SCRUM-260)

A child reported absent today is `counts.absent: 1` on the driver's run and **0** on the same run in `GET /api/head-of-transport/runs`. The contract defines `counts.absent` once, for every run, and a `RunSummary` is "a `Run` without `stops`"; its own sample `samples/runs/hot-runs.json` has `"absent": 1` on summaries. `backend/CLAUDE.md` describes the 0 as intended, so the code and the contract disagree.

It matters: the head's Today screen (SCRUM-255) shows "N absent" from `counts.absent` and works out progress as `students - absent`, so it never shows the absent children on a run, and its progress total includes children who won't ride.

`theHeadsSummaryCountsAbsentStopsLikeTheDriversRun` reproduces it and is skipped by default, because it fails today: run it with `-Dfinding.SCRUM-242-F1=true` (it answers "expected: <1> but was: <0>"). The ticket's rule is that failing tests are raised, not fixed by the tester, and Hashem's PRs are already merged, so it is a bug ticket: **SCRUM-260**, with the switch to remove once it is fixed.

### Not covered

- The confirmation and the end of a run racing each other, and a move racing a confirmation: the contract says the server serialises them per run. Hashem's suite holds the run lock to prove it; a black-box test can only fire requests together and hope they overlap, so it was left out rather than written flaky.
- The road provider: the test profile has no key, so arrival times are straight-line. The tests check that morning times are present and afternoon times are null, not their values.
- Deleting a route or applying generated routes mid-run: the contract lists them as known limits, not rules.
